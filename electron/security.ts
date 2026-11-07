import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type TreeEntry = { name: string; path: string; type: 'file' | 'directory' };
export type SearchMatch = { path: string; line: number; column: number; preview: string };

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  'release',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.idea'
]);

export const BLOCKED_PREVIEW_DIRECTORIES = new Set([
  ...SKIP_DIRECTORIES,
  '.git',
  '.ssh',
  '.aws',
  '.config'
]);

export function assertProject(root: string) {
  if (!root || !path.isAbsolute(root)) throw new Error('Choose a valid project folder first.');
}

export function safeTarget(root: string, relative: string) {
  const base = path.resolve(root);
  const target = path.resolve(base, relative || '.');
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Path escapes the opened project folder.');
  }
  return target;
}

export async function assertSafePath(root: string, relative: string) {
  assertProject(root);
  const base = path.resolve(root);
  const target = safeTarget(root, relative);
  const rel = path.relative(base, target);
  let current = base;
  const parts = rel ? rel.split(path.sep) : [];
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error('Symbolic links are blocked for project operations.');
      if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('A parent path component is not a directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

export function isSensitiveFile(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const name = normalized.split('/').pop() || '';
  if (/(^|\/)\.env(\.|$)/i.test(normalized) && !/\.(example|sample|template)$/i.test(normalized)) return true;
  if (/(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials\.json|secrets\.json|service-account\.json)$/i.test(normalized)) return true;
  if (/\.(pem|p12|pfx|key|keystore|jks)$/i.test(normalized)) return true;
  if (/^(\.npmrc|\.pypirc|\.netrc|\.git-credentials|auth\.json)$/i.test(name)) return true;
  return false;
}

export async function walk(root: string, current = '', depth = 0, result: TreeEntry[] = []): Promise<TreeEntry[]> {
  if (depth > 12 || result.length > 8000) return result;
  const dir = await assertSafePath(root, current);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort(
    (a, b) =>
      Number(b.isDirectory()) - Number(a.isDirectory()) ||
      Number(a.name.startsWith('.')) - Number(b.name.startsWith('.')) ||
      a.name.localeCompare(b.name)
  );
  for (const entry of entries) {
    if (result.length > 8000) break;
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const relative = path.posix.join(current.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: relative, type: 'directory' });
      await walk(root, relative, depth + 1, result);
    } else if (entry.isFile()) {
      result.push({ name: entry.name, path: relative, type: 'file' });
    }
  }
  return result;
}

export async function readProjectFile(root: string, relative: string) {
  const target = await assertSafePath(root, relative);
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Only regular files can be read.');
  if (stat.size > 2_500_000) throw new Error('File exceeds the 2.5 MB editor limit.');
  return fs.readFile(target, 'utf8');
}

export async function readProjectFileForAgent(root: string, relative: string) {
  if (isSensitiveFile(relative)) {
    throw new Error('Reading credential or secret files is blocked (' + relative + '). Ask the user to provide any required values directly.');
  }
  return readProjectFile(root, relative);
}

export async function writeProjectFile(root: string, relative: string, content: string) {
  assertProject(root);
  if (!relative || !relative.trim()) throw new Error('A relative file path is required.');
  if (relative.split(/[\\/]/).some(part => part === '..')) throw new Error('Invalid project-relative path.');
  const target = await assertSafePath(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || stat.isDirectory()) throw new Error('Refusing to overwrite a symlink or directory.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(target, content, 'utf8');
}

export async function createProjectItem(
  root: string,
  relative: string,
  type: 'file' | 'directory',
  content?: string,
  overwrite = false
) {
  assertProject(root);
  if (!relative || relative.split(/[\\/]/).some(part => part === '..')) {
    throw new Error('Invalid project-relative path.');
  }
  const target = await assertSafePath(root, relative);
  if (type === 'directory') {
    await fs.mkdir(target, { recursive: overwrite });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (typeof content === 'string') {
    if (!overwrite) {
      try {
        await fs.lstat(target);
        throw new Error('A file already exists at ' + relative + '.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    await fs.writeFile(target, content, 'utf8');
  } else {
    const handle = await fs.open(target, overwrite ? 'w' : 'wx');
    await handle.close();
  }
}

export async function deleteProjectItem(root: string, relative: string) {
  assertProject(root);
  const target = await assertSafePath(root, relative);
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) throw new Error('Refusing to delete symbolic links.');
  if (stat.isDirectory()) await fs.rm(target, { recursive: true, force: false });
  else await fs.unlink(target);
}

export async function renameProjectItem(root: string, from: string, to: string) {
  assertProject(root);
  const source = await assertSafePath(root, from);
  const target = await assertSafePath(root, to);
  if (!to || to.split(/[\\/]/).some(part => part === '..')) throw new Error('Invalid destination path.');
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error('Refusing to rename symbolic links.');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(source, target);
}

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.md', '.mdx', '.txt', '.yml', '.yaml', '.toml', '.xml', '.svg', '.py',
  '.rb', '.go', '.rs', '.java', '.cs', '.php', '.sh', '.ps1', '.sql', '.env', '.gitignore',
  '.dockerfile', '.vue', '.svelte'
]);

export async function searchFiles(root: string, query: string, limit = 100): Promise<SearchMatch[]> {
  assertProject(root);
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const entries = (await walk(root)).filter(entry => entry.type === 'file');
  const matches: SearchMatch[] = [];
  for (const entry of entries) {
    if (matches.length >= limit) break;
    const ext = path.extname(entry.name).toLowerCase();
    const base = entry.name.toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !['dockerfile', 'makefile', '.gitignore', '.env.example'].includes(base)) continue;
    try {
      const target = await assertSafePath(root, entry.path);
      const stat = await fs.lstat(target);
      if (stat.size > 600_000 || isSensitiveFile(entry.path)) continue;
      const raw = await fs.readFile(target, 'utf8');
      const lines = raw.split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        const column = lines[index].toLowerCase().indexOf(needle);
        if (column >= 0) {
          matches.push({
            path: entry.path,
            line: index + 1,
            column: column + 1,
            preview: lines[index].trim().slice(0, 220)
          });
          if (matches.length >= limit) break;
        }
      }
    } catch {
      // Binary or unreadable file: skip it.
    }
  }
  return matches;
}

export function runCommand(
  root: string,
  command: string,
  onOutput?: (chunk: string) => void,
  timeoutMs = 180_000
): { promise: Promise<{ code: number | null; output: string; timedOut: boolean }>; child: ChildProcessWithoutNullStreams } {
  assertProject(root);
  const child = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { cwd: root, windowsHide: true }
  ) as ChildProcessWithoutNullStreams;
  let output = '';
  let timedOut = false;
  const append = (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    if (output.length > 200_000) output = output.slice(-200_000);
    onOutput?.(text);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const timer = setTimeout(() => {
    timedOut = true;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGKILL');
  }, timeoutMs);
  const promise = new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolve, reject) => {
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
  return { promise, child };
}

export function killProcessTree(child: { pid?: number; kill?: (signal?: NodeJS.Signals) => boolean }) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill?.('SIGKILL');
  }
}
