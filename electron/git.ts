import simpleGit, { type SimpleGit } from 'simple-git';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertProject, isSensitiveFile } from './security';
import { getSecret, getSetting } from './settings';

export type GitChange = {
  path: string;
  index: string;
  workingDir: string;
  state: string;
};

export type GitSummary = {
  isRepo: boolean;
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  files: GitChange[];
  remotes: Array<{ name: string; url: string; pushUrl: string }>;
  remoteUrl: string | null;
  root: string;
  error?: string;
};

export type GitCommitResult = {
  commit: string;
  summary: string;
  branch: string;
  message: string;
};

function sanitizeRemote(url: string) {
  return url.replace(/\/\/[^/@]+@/, '//');
}

function stateFor(index: string, workingDir: string) {
  if (index === '?' || workingDir === '?') return 'untracked';
  if (index === 'U' || workingDir === 'U' || index === 'A' && workingDir === 'A') return 'conflict';
  if (index === 'D' || workingDir === 'D') return 'deleted';
  if (index === 'R') return 'renamed';
  if (index === 'A') return 'added';
  if (workingDir === 'M') return 'modified';
  if (index === 'M') return 'staged';
  return 'changed';
}

export async function gitSummary(root: string): Promise<GitSummary> {
  assertProject(root);
  const base: GitSummary = {
    isRepo: false,
    branch: '',
    tracking: null,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    remotes: [],
    remoteUrl: null,
    root
  };
  try {
    const git = simpleGit(root);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return base;
    const [status, branch, remotes] = await Promise.all([git.status(), git.branch(), git.getRemotes(true)]);
    const stats = status as unknown as { ahead?: number; behind?: number };
    const mappedRemotes = remotes.map(remote => ({
      name: remote.name,
      url: sanitizeRemote(remote.refs?.fetch || ''),
      pushUrl: sanitizeRemote(remote.refs?.push || '')
    }));
    return {
      isRepo: true,
      branch: branch.current || 'HEAD (detached)',
      tracking: status.tracking || null,
      ahead: Number(stats.ahead || 0),
      behind: Number(stats.behind || 0),
      clean: status.isClean(),
      files: status.files.map(file => ({
        path: file.path,
        index: file.index,
        workingDir: file.working_dir,
        state: stateFor(file.index, file.working_dir)
      })),
      remotes: mappedRemotes,
      remoteUrl: mappedRemotes.find(remote => remote.name === 'origin')?.url || mappedRemotes[0]?.url || null,
      root
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function gitDiff(root: string, file?: string): Promise<string> {
  assertProject(root);
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) throw new Error('This folder is not a Git repository yet.');
  const args = ['--no-color', '--unified=3'];
  if (file) args.push('--', file);
  const [working, staged] = await Promise.all([
    git.diff(args).catch(() => ''),
    git.diff(['--cached', ...args]).catch(() => '')
  ]);
  const combined = [staged, working].filter(Boolean).join('\n');
  if (!combined) {
    const status = await git.status();
    const untracked = status.files.filter(change => change.index === '?' || change.working_dir === '?');
    if (untracked.length) {
      return untracked
        .map(change => {
          return `--- untracked: ${change.path}\n(New file — open it in the editor to review its contents.)`;
        })
        .join('\n\n');
    }
  }
  return combined.slice(0, 400_000) || 'No changes to display.';
}

export async function gitCommit(root: string, message: string): Promise<GitCommitResult> {
  assertProject(root);
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) throw new Error('This folder is not a Git repository. Initialize Git first.');
  const status = await git.status();
  if (!status.files.length) throw new Error('There are no changes to commit.');
  const sensitive = status.files.map(file => file.path).filter(isSensitiveFile);
  if (sensitive.length) {
    throw new Error(
      'Commit blocked: these look like secret files:\n' +
        sensitive.join('\n') +
        '\nRemove them or add them to .gitignore before committing.'
    );
  }
  const cleanMessage = message.trim() || 'Changes from DARKI Code Studio';
  await ensureIdentity(git);
  await git.add(['-A']);
  const result = await git.commit(cleanMessage);
  const branch = (await git.branch()).current;
  return {
    commit: result.commit,
    summary: `${result.summary.changes} change(s), ${result.summary.insertions} insertion(s), ${result.summary.deletions} deletion(s)`,
    branch,
    message: cleanMessage
  };
}

async function ensureIdentity(git: SimpleGit) {
  const name = await git.getConfig('user.name').then(value => value.value).catch(() => null);
  if (!name) {
    const login = getSetting('githubLogin') || 'DARKI Code Studio';
    await git.addConfig('user.name', login, false, 'local');
  }
  const email = await git.getConfig('user.email').then(value => value.value).catch(() => null);
  if (!email) {
    const login = getSetting('githubLogin');
    await git.addConfig(
      'user.email',
      login ? `${login}@users.noreply.github.com` : 'darki@users.noreply.github.com',
      false,
      'local'
    );
  }
}

function authenticatedUrl(url: string) {
  const token = getSecret('githubToken');
  if (!token || !/^https:\/\/github\.com\//i.test(url)) return url;
  return url.replace(/^https:\/\/(?:[^@/]+@)?github\.com\//i, 'https://' + encodeURIComponent(token) + '@github.com/');
}

export async function gitPush(root: string): Promise<string> {
  assertProject(root);
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) throw new Error('This folder is not a Git repository.');
  const summary = await gitSummary(root);
  if (!summary.clean) throw new Error('Commit your changes before pushing (or use Commit & Push).');
  if (!summary.remotes.length) throw new Error('No Git remote is configured. Add an origin remote or publish to GitHub first.');
  if (!summary.branch || summary.branch.startsWith('HEAD')) throw new Error('Checkout a branch before pushing.');
  const remote = summary.remotes.find(item => item.name === 'origin') || summary.remotes[0];
  const pushUrl = authenticatedUrl(remote.pushUrl || remote.url);
  await git.push(pushUrl, summary.branch, ['--set-upstream']);
  return `Pushed ${summary.branch} to ${remote.name}.`;
}

export async function gitPull(root: string): Promise<string> {
  assertProject(root);
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) throw new Error('This folder is not a Git repository.');
  const summary = await gitSummary(root);
  if (!summary.remotes.length) throw new Error('No Git remote is configured.');
  const remote = summary.remotes.find(item => item.name === 'origin') || summary.remotes[0];
  const pullUrl = authenticatedUrl(remote.url);
  const result = await git.pull(pullUrl, summary.branch);
  return `Pulled ${remote.name}/${summary.branch}. ${result.summary.changes} change(s), ${result.summary.insertions} insertion(s), ${result.summary.deletions} deletion(s).`;
}

export async function gitBranches(root: string) {
  assertProject(root);
  const git = simpleGit(root);
  if (!(await git.checkIsRepo())) return { current: '', local: [], remote: [] };
  const [local, remote] = await Promise.all([git.branchLocal(), git.branch(['-r']).catch(() => ({ all: [] }))]);
  return {
    current: local.current,
    local: local.all,
    remote: remote.all.filter(name => !name.includes('HEAD'))
  };
}

export async function gitCheckout(root: string, branch: string) {
  assertProject(root);
  const git = simpleGit(root);
  const status = await git.status();
  if (!status.isClean()) throw new Error('Commit or stash your changes before switching branches.');
  await git.checkout(branch);
  return `Switched to ${branch}.`;
}

export async function gitCreateBranch(root: string, branch: string) {
  assertProject(root);
  const clean = branch.trim();
  if (!clean) throw new Error('Branch name is required.');
  if (!/^[A-Za-z0-9._/-]+$/.test(clean) || clean.startsWith('-') || clean.endsWith('/')) {
    throw new Error('Enter a valid branch name.');
  }
  const git = simpleGit(root);
  await git.checkoutLocalBranch(clean);
  return `Created and switched to ${clean}.`;
}

export async function gitInit(root: string) {
  assertProject(root);
  const git = simpleGit(root);
  if (await git.checkIsRepo()) return 'This folder is already a Git repository.';
  await git.init();
  await ensureGitignore(root);
  return 'Initialized a Git repository.';
}

async function ensureGitignore(root: string) {
  const file = path.join(root, '.gitignore');
  try {
    const existing = await fs.readFile(file, 'utf8');
    if (existing.trim()) return;
  } catch {
    // Create it below.
  }
  const content = [
    'node_modules/',
    'dist/',
    'build/',
    'release/',
    '.env',
    '.env.*',
    '!.env.example',
    '*.log',
    '.DS_Store',
    'Thumbs.db'
  ].join('\n');
  await fs.writeFile(file, content + '\n', 'utf8');
}

export async function gitClone(url: string, destination: string) {
  const target = url.trim();
  if (!/^https:\/\/|^git@|^ssh:\/\//i.test(target)) throw new Error('Enter a valid Git repository URL.');
  const cloneUrl = authenticatedUrl(target);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await simpleGit().clone(cloneUrl, destination);
  return destination;
}
