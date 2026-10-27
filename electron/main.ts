import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import simpleGit from 'simple-git';

let mainWindow: BrowserWindow | null = null;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const settings: Record<string, string> = {};

async function loadSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Record<string, string>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.endsWith('Encrypted') && safeStorage.isEncryptionAvailable()) {
        try { settings[key.replace('Encrypted', '')] = safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { /* ignore unreadable secrets */ }
      } else settings[key] = value;
    }
  } catch { /* first run */ }
}
async function persistSettings() {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (['openrouterKey', 'githubToken'].includes(key)) {
      if (safeStorage.isEncryptionAvailable()) out[key + 'Encrypted'] = safeStorage.encryptString(value).toString('base64');
    } else out[key] = value;
  }
  await fs.writeFile(settingsPath(), JSON.stringify(out, null, 2), { mode: 0o600 });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1000, minHeight: 650, backgroundColor: '#0f172a',
    title: 'DARKI Code Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function safeTarget(root: string, relative: string) {
  const base = path.resolve(root);
  const target = path.resolve(base, relative || '.');
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Path escapes the opened project folder.');
  return target;
}
async function walk(root: string, current = ''): Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>> {
  const dir = safeTarget(root, current);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: Array<{ name: string; path: string; type: 'file' | 'directory' }> = [];
  for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', 'dist', 'release'].includes(entry.name)) continue;
    const relativePath = path.posix.join(current.replace(/\\/g, '/'), entry.name);
    result.push({ name: entry.name, path: relativePath, type: entry.isDirectory() ? 'directory' : 'file' });
    if (entry.isDirectory() && current.split('/').length < 3) result.push(...await walk(root, relativePath));
  }
  return result;
}

app.whenReady().then(async () => {
  await loadSettings();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('fs:list', async (_e, root: string) => walk(root));
  ipcMain.handle('fs:read', async (_e, root: string, rel: string) => {
    const target = safeTarget(root, rel);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Only regular project files can be read.');
    if (stat.size > 2_000_000) throw new Error('File is too large to open (2 MB limit).');
    return fs.readFile(target, 'utf8');
  });
  ipcMain.handle('fs:write', async (_e, root: string, rel: string, content: string) => {
    const target = safeTarget(root, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('Symbolic links are not writable.'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    await fs.writeFile(target, content, 'utf8');
  });
  ipcMain.handle('openrouter:models', async () => {
    const key = settings.openrouterKey;
    const response = await fetch('https://openrouter.ai/api/v1/models', { headers: key ? { Authorization: 'Bearer ' + key } : {} });
    if (!response.ok) throw new Error('OpenRouter models request failed: ' + response.status);
    const data = await response.json() as { data?: Array<{ id: string; name?: string; context_length?: number }> };
    return (data.data ?? []).map(m => ({ id: m.id, name: m.name || m.id, context_length: m.context_length }));
  });
  ipcMain.handle('openrouter:chat', async (_e, req: { model: string; messages: Array<{ role: string; content: string }>; temperature?: number }) => {
    const key = settings.openrouterKey;
    if (!key) throw new Error('Add your OpenRouter API key in Settings first.');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://darki.online', 'X-Title': 'DARKI Code Studio' },
      body: JSON.stringify({ model: req.model, messages: req.messages, temperature: req.temperature ?? 0.2 })
    });
    if (!response.ok) throw new Error('OpenRouter request failed (' + response.status + '): ' + (await response.text()).slice(0, 500));
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
    const content = data.choices?.[0]?.message?.content;
    return Array.isArray(content) ? content.map(c => c.text || '').join('') : content || '';
  });
  ipcMain.handle('settings:save', async (_e, key: string, value: string) => {
    if (!['openrouterKey', 'githubToken', 'defaultModel', 'approvalMode'].includes(key)) throw new Error('Unsupported setting.');
    settings[key] = value;
    await persistSettings();
  });
  ipcMain.handle('settings:read', async (_e, key: string) => {
    if (['openrouterKey', 'githubToken'].includes(key)) return settings[key] || null;
    return settings[key] || null;
  });
  ipcMain.handle('git:status', async (_e, root: string) => {
    const git = simpleGit(root);
    const branch = await git.branch();
    const status = await git.status();
    return { branch: branch.current || '—', status: status.files.length ? status.files.length + ' changed file(s)' : 'Clean' };
  });
  ipcMain.handle('git:push', async (_e, root: string) => {
    const git = simpleGit(root);
    const status = await git.status();
    if (status.files.length) throw new Error('Commit your changes before pushing. This app will not create a commit without review.');
    await git.push();
    return 'Push completed.';
  });
  ipcMain.handle('preview:url', async (_e, root: string) => {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
      return pkg.scripts?.dev ? 'http://localhost:5173' : null;
    } catch { return null; }
  });
  ipcMain.handle('command:run', async (_e, root: string, command: string) => {
    if (!command.trim()) throw new Error('Command is empty.');
    // Explicitly invoked only from the app's approval UI. Execute via PowerShell without logging secrets.
    return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { cwd: root, windowsHide: true });
      let output = '';
      child.stdout.on('data', d => { output += d.toString(); });
      child.stderr.on('data', d => { output += d.toString(); });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output: output.slice(-100_000) }));
    });
  });
}).catch(err => { console.error('Startup failed:', err); app.quit(); });

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });