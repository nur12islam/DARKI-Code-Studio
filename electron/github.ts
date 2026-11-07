import simpleGit from 'simple-git';
import { getSecret, setGithubLogin } from './settings';
import { assertProject } from './security';
import { gitCommit, gitInit, gitPush, gitSummary } from './git';

export type GithubUser = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
};

export type GithubRepo = {
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  updatedAt: string | null;
  defaultBranch: string;
};

function token() {
  const value = getSecret('githubToken');
  if (!value) throw new Error('No GitHub token is saved. Add one in Settings → Git & GitHub.');
  return value;
}

async function api<T = Record<string, unknown>>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch('https://api.github.com' + endpoint, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(30_000)
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error('GitHub API ' + response.status + ': ' + (body.message || 'request failed'));
  }
  return body as T;
}

export async function verifyGithub(): Promise<GithubUser> {
  const user = await api<{ login?: string; name?: string | null; avatar_url?: string | null; html_url?: string | null }>('/user');
  const result = {
    login: String(user.login || 'unknown'),
    name: user.name ?? null,
    avatarUrl: user.avatar_url ?? null,
    htmlUrl: user.html_url ?? null
  };
  await setGithubLogin(result.login);
  return result;
}

export async function listGithubRepos(): Promise<GithubRepo[]> {
  const repos = await api<Array<{
    name?: string;
    full_name?: string;
    private?: boolean;
    html_url?: string;
    clone_url?: string;
    updated_at?: string;
    default_branch?: string;
  }>>('/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator');
  return repos.map(repo => ({
    name: String(repo.name || ''),
    fullName: String(repo.full_name || ''),
    private: Boolean(repo.private),
    htmlUrl: String(repo.html_url || ''),
    cloneUrl: String(repo.clone_url || ''),
    updatedAt: repo.updated_at ?? null,
    defaultBranch: String(repo.default_branch || 'main')
  }));
}

export type PublishResult = {
  repoUrl: string;
  published: boolean;
  message: string;
  detail?: string;
};

export async function createRepoAndPublish(input: {
  root?: string | null;
  name: string;
  description?: string;
  private?: boolean;
}): Promise<PublishResult> {
  const name = input.name.trim();
  if (!name) throw new Error('Repository name is required.');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Use letters, numbers, dots, dashes and underscores for the repository name.');

  const created = await api<{ html_url?: string; clone_url?: string; full_name?: string }>('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: input.description || 'Created with DARKI Code Studio',
      private: input.private !== false,
      auto_init: false
    })
  });
  const htmlUrl = String(created.html_url || '');
  const cloneUrl = String(created.clone_url || '');

  if (!input.root) {
    return { repoUrl: htmlUrl, published: false, message: 'Repository created.', detail: htmlUrl };
  }

  assertProject(input.root);
  try {
    const summary = await gitSummary(input.root);
    if (!summary.isRepo) await gitInit(input.root);
    const git = simpleGit(input.root);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(remote => remote.name === 'origin');
    const authenticated = cloneUrl.replace(
      /^https:\/\//i,
      'https://' + encodeURIComponent(getSecret('githubToken') || '') + '@'
    );
    if (origin) {
      await git.remote(['set-url', 'origin', authenticated]);
    } else {
      await git.addRemote('origin', authenticated);
    }

    const current = await gitSummary(input.root);
    let committed = false;
    if (!current.clean) {
      await gitCommit(input.root, 'Initial commit from DARKI Code Studio');
      committed = true;
    }
    await gitPush(input.root);
    return {
      repoUrl: htmlUrl,
      published: true,
      message: 'Repository created and project published.',
      detail: committed ? 'Committed local changes and pushed.' : 'Pushed existing commits.'
    };
  } catch (error) {
    return {
      repoUrl: htmlUrl,
      published: false,
      message: 'Repository created, but publishing the project failed.',
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function createPullRequest(input: {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
}): Promise<string> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const title = input.title.trim();
  const head = input.head.trim();
  const base = input.base.trim() || 'main';
  if (!owner || !repo || !title || !head) throw new Error('Owner, repository, title and head branch are required.');
  const result = await api<{ html_url?: string }>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/pulls',
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        head,
        base,
        body: input.body || 'Created with DARKI Code Studio'
      })
    }
  );
  return result.html_url || 'Pull request created.';
}

export async function listPullRequests(owner: string, repo: string) {
  return api<Array<{ number: number; title: string; state: string; html_url: string; user?: { login?: string } }>>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/pulls?state=open&per_page=30'
  );
}
