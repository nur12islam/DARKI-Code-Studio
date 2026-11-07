import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { assertProject, BLOCKED_PREVIEW_DIRECTORIES, isSensitiveFile, killProcessTree } from './security';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json'
};

let staticServer: http.Server | null = null;
let staticRoot: string | null = null;
let staticUrl: string | null = null;

export function getStaticPreview() {
  return { url: staticUrl, root: staticRoot };
}

export function stopStaticServer() {
  if (!staticServer) return;
  try {
    staticServer.close();
  } catch {
    // Already closed.
  }
  staticServer = null;
  staticRoot = null;
  staticUrl = null;
}

export async function startStaticServer(root: string): Promise<string> {
  assertProject(root);
  const resolvedRoot = path.resolve(root);
  if (staticServer && staticRoot === resolvedRoot && staticUrl) return staticUrl;
  stopStaticServer();

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      let relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
      if (!relative) relative = 'index.html';
      const firstSegment = relative.split('/')[0];
      if (BLOCKED_PREVIEW_DIRECTORIES.has(firstSegment)) {
        response.writeHead(404).end('Not found');
        return;
      }
      if (isSensitiveFile(relative)) {
        response.writeHead(403).end('Blocked');
        return;
      }
      let target = path.resolve(resolvedRoot, relative);
      if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
        response.writeHead(403).end('Blocked');
        return;
      }
      let stat = await fs.stat(target).catch(() => null);
      if (stat?.isDirectory()) {
        target = path.join(target, 'index.html');
        stat = await fs.stat(target).catch(() => null);
      }
      if (!stat?.isFile()) {
        // Single-page apps: use index.html for extension-less route requests.
        if (!path.extname(relative)) {
          target = path.join(resolvedRoot, 'index.html');
          stat = await fs.stat(target).catch(() => null);
        }
      }
      if (!stat?.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('File not found: ' + relative);
        return;
      }
      const extension = path.extname(target).toLowerCase();
      response.writeHead(200, {
        'Content-Type': MIME[extension] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
      });
      response.end(await fs.readFile(target));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not determine the preview server port.');
  }
  staticServer = server;
  staticRoot = resolvedRoot;
  staticUrl = `http://127.0.0.1:${address.port}/`;
  return staticUrl;
}

export type DevServerStatus = {
  running: boolean;
  root: string | null;
  url: string | null;
  command: string | null;
  logs: string[];
};

type DevState = {
  child: ChildProcess;
  root: string;
  url: string | null;
  command: string;
  logs: string[];
};

let devState: DevState | null = null;
let devOutputHandler: ((chunk: string) => void) | null = null;

export function setDevOutputHandler(handler: ((chunk: string) => void) | null) {
  devOutputHandler = handler;
}

export function getDevServerStatus(): DevServerStatus {
  return {
    running: Boolean(devState),
    root: devState?.root ?? null,
    url: devState?.url ?? null,
    command: devState?.command ?? null,
    logs: devState?.logs.slice(-80) ?? []
  };
}

async function detectCommand(root: string) {
  const packageFile = path.join(root, 'package.json');
  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(await fs.readFile(packageFile, 'utf8')) as { scripts?: Record<string, string> }).scripts || {};
  } catch {
    throw new Error('No package.json found. The static preview works without a dev server.');
  }
  if (!scripts.dev && !scripts.start && !scripts.serve) {
    throw new Error('No “dev”, “start” or “serve” script found in package.json.');
  }
  const script = scripts.dev ? 'dev' : scripts.start ? 'start' : 'serve';
  const exists = async (file: string) => fs.stat(path.join(root, file)).then(() => true).catch(() => false);
  const manager = (await exists('pnpm-lock.yaml'))
    ? 'pnpm'
    : (await exists('yarn.lock'))
      ? 'yarn'
      : (await exists('bun.lockb')) || (await exists('bun.lock'))
        ? 'bun'
        : 'npm';
  return { command: `${manager} run ${script}`, script };
}

function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

export async function startDevServer(root: string): Promise<{ url: string; command: string }> {
  assertProject(root);
  stopDevServer();
  const { command } = await detectCommand(root);
  const child = spawn(command, [], {
    cwd: root,
    shell: true,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', BROWSER: 'none' }
  });
  const state: DevState = { child, root, url: null, command, logs: [] };
  devState = state;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishOk = (url: string) => {
      if (settled) return;
      settled = true;
      state.url = url;
      resolve({ url, command });
    };
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      const text = stripAnsi(chunk.toString());
      state.logs.push(text);
      if (state.logs.length > 200) state.logs.shift();
      devOutputHandler?.(text);
      const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\/?/i);
      if (match) finishOk(match[0].endsWith('/') ? match[0] : match[0] + '/');
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('error', error => finishError(error));
    child.once('exit', code => {
      if (!settled) {
        finishError(
          new Error(
            `Dev server exited with code ${code}. ` +
              (state.logs.join('').trim().slice(-600) || 'Check the command and dependencies.')
          )
        );
      }
      if (devState === state) devState = null;
    });
    setTimeout(() => {
      finishError(new Error('The dev server did not report a local URL within 45 seconds. Check the terminal output.'));
    }, 45_000).unref?.();
  });
}

export function stopDevServer() {
  if (!devState) return;
  const state = devState;
  devState = null;
  killProcessTree(state.child);
}
