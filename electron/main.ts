import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  assertProject,
  createProjectItem,
  deleteProjectItem,
  readProjectFile,
  renameProjectItem,
  runCommand,
  searchFiles,
  walk,
  writeProjectFile,
  killProcessTree,
  type TreeEntry
} from './security';
import {
  getRecentProjects,
  getSetting,
  loadSettings,
  publicSettings,
  rememberProject,
  updateSettings,
  type SettingsPatch
} from './settings';
import { listModels, streamChat, testProvider, type ChatMessage } from './providers';
import { runAgent, setApprovalHandler, undoLastAiChange, type AgentEvent, type ApprovalAction } from './agent';
import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitCreateBranch,
  gitDiff,
  gitInit,
  gitPull,
  gitPush,
  gitSummary
} from './git';
import {
  createPullRequest,
  createRepoAndPublish,
  listGithubRepos,
  listPullRequests,
  verifyGithub
} from './github';
import {
  getDevServerStatus,
  getStaticPreview,
  setDevOutputHandler,
  startDevServer,
  startStaticServer,
  stopDevServer,
  stopStaticServer
} from './preview';

let mainWindow: BrowserWindow | null = null;
const pendingApprovals = new Map<string, (approved: boolean) => void>();
const chatControllers = new Map<string, AbortController>();
const runningCommands = new Map<string, ReturnType<typeof runCommand>['child']>();
let approvalSeq = 0;

function createWindow() {
  nativeTheme.themeSource = 'dark';
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0b0f17',
    title: 'DARKI Code Studio',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const [id, resolve] of pendingApprovals) {
      resolve(false);
      pendingApprovals.delete(id);
    }
  });
}

async function approve(action: ApprovalAction): Promise<boolean> {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const id = String(++approvalSeq);
  return new Promise<boolean>(resolve => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(id);
      resolve(false);
    }, 180_000);
    pendingApprovals.set(id, approved => {
      clearTimeout(timer);
      pendingApprovals.delete(id);
      resolve(approved);
    });
    mainWindow!.webContents.send('approval:request', { id, ...action });
  });
}

setApprovalHandler(approve);

function validateProjectName(name: string) {
  const clean = String(name || '').trim();
  if (
    !clean ||
    clean === '.' ||
    clean === '..' ||
    /[<>:"|?*]/.test(clean) ||
    clean.includes('/') ||
    clean.includes('\\') ||
    /[. ]$/.test(clean)
  ) {
    throw new Error('Enter a valid project folder name.');
  }
  return clean;
}

const GITIGNORE = [
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

type Template = 'react' | 'static' | 'node' | 'blank';

function scaffold(template: Template, cleanName: string): Record<string, string> {
  if (template === 'static') {
    return {
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b0f17" />
    <title>${cleanName.replace(/[&<>"]/g, '')}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="page">
      <span class="eyebrow">DARKI CODE STUDIO</span>
      <h1>Build something <span>extraordinary.</span></h1>
      <p>This static starter is ready. Edit <code>index.html</code>, <code>style.css</code> and <code>script.js</code>.</p>
      <button id="action">Try the button</button>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
      'style.css': `:root{font-family:Inter,system-ui,sans-serif;color:#e8eefc;background:#0b0f17;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px}
.page{max-width:680px;padding:48px;border:1px solid #1f2a3d;border-radius:20px;background:linear-gradient(160deg,#101827,#0b0f17);box-shadow:0 30px 80px #0008}
.eyebrow{font-size:11px;letter-spacing:.22em;color:#67e8f9}h1{font-size:clamp(34px,6vw,58px);line-height:1.05;margin:14px 0}
h1 span{color:#67e8f9}p{color:#94a3b8;line-height:1.7}code{color:#c4b5fd}button{margin-top:20px;padding:12px 20px;border:0;border-radius:10px;background:#22d3ee;color:#06121a;font-weight:700;cursor:pointer}
`,
      'script.js': `document.getElementById('action')?.addEventListener('click', event => {
  const button = event.currentTarget;
  button.textContent = 'It works! 🎉';
  button.style.background = '#a78bfa';
});
`,
      'README.md': `# ${cleanName}\n\nA static project created with DARKI Code Studio.\n\nOpen \`index.html\` and use the Preview panel.\n`,
      '.gitignore': GITIGNORE + '\n'
    };
  }

  if (template === 'node') {
    return {
      'package.json': JSON.stringify(
        {
          name: cleanName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'darki-node-project',
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: { start: 'node index.js' }
        },
        null,
        2
      ) + '\n',
      'index.js': `console.log('Hello from ${cleanName}');\n`,
      'README.md': `# ${cleanName}\n\nA Node.js project created with DARKI Code Studio.\n\n\`\`\`\nnpm start\n\`\`\`\n`,
      '.gitignore': GITIGNORE + '\n'
    };
  }

  if (template === 'blank') {
    return {
      'README.md': `# ${cleanName}\n\nCreated with DARKI Code Studio.\n`,
      '.gitignore': GITIGNORE + '\n'
    };
  }

  return {
    'package.json': JSON.stringify(
      {
        name: cleanName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'darki-project',
        version: '1.0.0',
        private: true,
        type: 'module',
        scripts: { dev: 'vite --host 127.0.0.1', build: 'vite build', preview: 'vite preview --host 127.0.0.1' },
        dependencies: { react: 'latest', 'react-dom': 'latest' },
        devDependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', typescript: 'latest' }
      },
      null,
      2
    ) + '\n',
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b0f17" />
    <title>${cleanName.replace(/[&<>"]/g, '')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'src/main.tsx': `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './style.css';\n\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);\n`,
    'src/App.tsx': `export default function App() {\n  return (\n    <main className="page">\n      <span className="eyebrow">YOUR NEXT IDEA STARTS HERE</span>\n      <h1>Build something <span>extraordinary.</span></h1>\n      <p>Your new project is ready. Edit <code>src/App.tsx</code> and start creating.</p>\n    </main>\n  );\n}\n`,
    'src/style.css': `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f4f4f5;background:#0b0f17;color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh}.page{max-width:900px;margin:18vh auto;padding:32px}.eyebrow{font-size:12px;letter-spacing:.18em;color:#67e8f9}.page h1{font-size:clamp(40px,7vw,76px);line-height:1.04;letter-spacing:-.05em}.page h1 span{color:#67e8f9}.page p{color:#94a3b8;line-height:1.8}.page code{color:#c4b5fd;background:#172033;padding:3px 7px;border-radius:5px}\n`,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx'
        },
        include: ['src']
      },
      null,
      2
    ) + '\n',
    'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n`,
    '.gitignore': GITIGNORE + '\n',
    'README.md': `# ${cleanName}\n\nCreated with DARKI Code Studio.\n\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n`
  };
}

async function remember(folder: string) {
  rememberProject(folder);
  await updateSettings({ recentProjects: getRecentProjects(), lastProjectRoot: folder });
}

async function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node
  }));
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened.');
    await shell.openExternal(url);
  });
  ipcMain.handle('app:showItemInFolder', (_event, target: string) => {
    shell.showItemInFolder(target);
  });

  ipcMain.handle('settings:get', () => publicSettings());
  ipcMain.handle('settings:update', async (_event, patch: SettingsPatch) => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid settings payload.');
    return updateSettings(patch);
  });
  ipcMain.handle('settings:clearSecret', async (_event, secret: string) => {
    if (!['geminiKey', 'openrouterKey', 'githubToken'].includes(secret)) throw new Error('Unknown credential.');
    return updateSettings({ clearSecrets: [secret] });
  });

  ipcMain.handle('provider:models', async (_event, provider: 'gemini' | 'openrouter') => {
    return listModels(provider === 'openrouter' ? 'openrouter' : 'gemini');
  });
  ipcMain.handle('provider:test', async (_event, provider: 'gemini' | 'openrouter') => {
    return testProvider(provider === 'openrouter' ? 'openrouter' : 'gemini');
  });

  ipcMain.handle(
    'provider:chat',
    async (
      _event,
      request: {
        root: string;
        requestId: string;
        provider: 'gemini' | 'openrouter';
        model: string;
        messages: ChatMessage[];
        temperature?: number;
        autoFallback?: boolean;
        fallbackModels?: string[];
      }
    ) => {
      if (!request?.requestId) throw new Error('Missing request id.');
      assertProject(request.root);
      if (!Array.isArray(request.messages) || !request.messages.length) throw new Error('Message history is empty.');
      const previous = chatControllers.get(request.requestId);
      if (previous) previous.abort();
      const controller = new AbortController();
      chatControllers.set(request.requestId, controller);

      const emit = (event: AgentEvent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:event', { requestId: request.requestId, event });
        }
      };
      const onDelta = (chunk: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('chat:chunk', { requestId: request.requestId, chunk });
        }
      };

      try {
        const result = await runAgent(
          {
            requestId: request.requestId,
            root: request.root,
            provider: request.provider === 'openrouter' ? 'openrouter' : 'gemini',
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            autoFallback: request.autoFallback,
            fallbackModels: request.fallbackModels
          },
          controller.signal,
          emit,
          onDelta
        );
        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          return { content: '', steps: 0, cancelled: true };
        }
        throw error;
      } finally {
        chatControllers.delete(request.requestId);
      }
    }
  );
  ipcMain.handle('provider:cancel', (_event, requestId: string) => {
    const controller = chatControllers.get(requestId);
    if (!controller) return false;
    controller.abort();
    chatControllers.delete(requestId);
    return true;
  });

  ipcMain.handle('approval:respond', (_event, id: string, approved: boolean) => {
    const resolve = pendingApprovals.get(id);
    if (!resolve) return false;
    resolve(Boolean(approved));
    return true;
  });

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open a project folder',
      buttonLabel: 'Open project',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const root = result.filePaths[0];
    await remember(root);
    return root;
  });
  ipcMain.handle('project:openRecent', async (_event, root: string) => {
    assertProject(root);
    const stat = await fs.stat(root).catch(() => null);
    if (!stat?.isDirectory()) throw new Error('That project folder is no longer available.');
    await remember(root);
    return root;
  });
  ipcMain.handle('project:validate', async (_event, root: string) => {
    if (!root || !path.isAbsolute(root)) return false;
    const stat = await fs.stat(root).catch(() => null);
    return Boolean(stat?.isDirectory());
  });
  ipcMain.handle('project:parent', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose where to create your new project',
      buttonLabel: 'Choose parent folder',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle(
    'project:create',
    async (_event, parent: string, name: string, template: Template = 'react') => {
      assertProject(parent);
      const clean = validateProjectName(name);
      const target = path.resolve(parent, clean);
      if (path.dirname(target) !== path.resolve(parent)) {
        throw new Error('Project must be created directly inside the selected parent folder.');
      }
      await fs.mkdir(target, { recursive: false });
      const files = scaffold(
        template === 'static' || template === 'node' || template === 'blank' ? template : 'react',
        clean
      );
      for (const [relative, content] of Object.entries(files)) {
        const file = path.join(target, relative);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, content, 'utf8');
      }
      await remember(target);
      return target;
    }
  );
  ipcMain.handle('project:clone', async (_event, url: string) => {
    const parent = await dialog.showOpenDialog({
      title: 'Choose where to clone the repository',
      buttonLabel: 'Clone here',
      properties: ['openDirectory', 'createDirectory']
    });
    if (parent.canceled || !parent.filePaths[0]) return null;
    const repoName =
      String(url)
        .replace(/\.git$/i, '')
        .split(/[\\/]/)
        .pop()
        ?.replace(/[^A-Za-z0-9._-]/g, '') || 'cloned-repo';
    const destination = path.join(parent.filePaths[0], repoName);
    const exists = await fs.stat(destination).then(() => true).catch(() => false);
    if (exists) throw new Error(`Destination already exists: ${destination}`);
    const { gitClone } = await import('./git');
    await gitClone(String(url), destination);
    await remember(destination);
    return destination;
  });

  ipcMain.handle('fs:list', async (_event, root: string): Promise<TreeEntry[]> => {
    assertProject(root);
    return walk(root);
  });
  ipcMain.handle('fs:read', async (_event, root: string, relative: string) => readProjectFile(root, relative));
  ipcMain.handle('fs:write', async (_event, root: string, relative: string, content: string) => {
    await writeProjectFile(root, relative, String(content ?? ''));
  });
  ipcMain.handle(
    'fs:create',
    async (
      _event,
      root: string,
      relative: string,
      type: 'file' | 'directory',
      content?: string,
      overwrite = false
    ) => {
      await createProjectItem(root, relative, type, content, Boolean(overwrite));
    }
  );
  ipcMain.handle('fs:delete', async (_event, root: string, relative: string) => {
    await deleteProjectItem(root, relative);
  });
  ipcMain.handle('fs:rename', async (_event, root: string, from: string, to: string) => {
    await renameProjectItem(root, from, to);
  });
  ipcMain.handle('fs:search', async (_event, root: string, query: string, limit = 100) => {
    return searchFiles(root, query, Math.min(200, Number(limit) || 100));
  });
  ipcMain.handle('undo:last', async (_event, root: string) => undoLastAiChange(root));

  ipcMain.handle('git:summary', async (_event, root: string) => gitSummary(root));
  ipcMain.handle('git:diff', async (_event, root: string, file?: string) => gitDiff(root, file));
  ipcMain.handle('git:commit', async (_event, root: string, message: string) => gitCommit(root, message));
  ipcMain.handle('git:push', async (_event, root: string) => gitPush(root));
  ipcMain.handle('git:pull', async (_event, root: string) => gitPull(root));
  ipcMain.handle('git:branches', async (_event, root: string) => gitBranches(root));
  ipcMain.handle('git:checkout', async (_event, root: string, branch: string) => gitCheckout(root, branch));
  ipcMain.handle('git:createBranch', async (_event, root: string, branch: string) => gitCreateBranch(root, branch));
  ipcMain.handle('git:init', async (_event, root: string) => gitInit(root));

  ipcMain.handle('github:verify', async () => verifyGithub());
  ipcMain.handle('github:repos', async () => listGithubRepos());
  ipcMain.handle(
    'github:create',
    async (
      _event,
      input: { root?: string | null; name: string; description?: string; private?: boolean }
    ) => createRepoAndPublish(input)
  );
  ipcMain.handle(
    'github:pr',
    async (
      _event,
      input: { owner: string; repo: string; title: string; head: string; base: string; body?: string }
    ) => createPullRequest(input)
  );
  ipcMain.handle('github:prs', async (_event, owner: string, repo: string) => listPullRequests(owner, repo));

  ipcMain.handle('preview:startStatic', async (_event, root: string) => startStaticServer(root));
  ipcMain.handle('preview:stopStatic', () => stopStaticServer());
  ipcMain.handle('preview:status', () => getStaticPreview());
  ipcMain.handle('dev:start', async (_event, root: string) => startDevServer(root));
  ipcMain.handle('dev:stop', () => {
    stopDevServer();
    return true;
  });
  ipcMain.handle('dev:status', () => getDevServerStatus());

  ipcMain.handle('command:run', async (_event, root: string, command: string, requestId: string) => {
    assertProject(root);
    const clean = String(command || '').trim();
    if (!clean) throw new Error('Command is empty.');
    const approved = await approve({
      title: 'Run this command?',
      detail: clean,
      kind: 'command',
      meta: clean
    });
    if (!approved) throw new Error('Command denied.');
    const runner = runCommand(root, clean, chunk => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('command:output', { requestId, chunk });
      }
    });
    runningCommands.set(requestId, runner.child);
    try {
      return await runner.promise;
    } finally {
      runningCommands.delete(requestId);
    }
  });
  ipcMain.handle('command:stop', (_event, requestId: string) => {
    const child = runningCommands.get(requestId);
    if (!child) return false;
    killProcessTree(child);
    runningCommands.delete(requestId);
    return true;
  });

  setDevOutputHandler(chunk => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dev:output', { chunk });
    }
  });
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId('online.darki.codestudio');
      await loadSettings();
      await registerIpc();
      createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch(error => {
      console.error('Startup failed:', error);
      app.quit();
    });
}

app.on('before-quit', () => {
  stopStaticServer();
  stopDevServer();
  for (const controller of chatControllers.values()) controller.abort();
  for (const child of runningCommands.values()) killProcessTree(child);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
