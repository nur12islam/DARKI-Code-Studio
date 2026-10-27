import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import simpleGit from 'simple-git';

let mainWindow: BrowserWindow | null = null;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const settings: Record<string, string> = {};
const pendingApprovals = new Map<string, (approved: boolean) => void>();
let approvalSeq = 0;

async function loadSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Record<string, string>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.endsWith('Encrypted') && safeStorage.isEncryptionAvailable()) {
        try { settings[key.replace('Encrypted', '')] = safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { /* old OS key unavailable */ }
      } else settings[key] = value;
    }
  } catch { /* first run */ }
}
async function persistSettings() {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (['openrouterKey', 'githubToken'].includes(key)) {
      if (safeStorage.isEncryptionAvailable()) out[key + 'Encrypted'] = safeStorage.encryptString(value).toString('base64');
      else out[key] = value; // Electron warns in UI if OS encryption is unavailable.
    } else out[key] = value;
  }
  await fs.writeFile(settingsPath(), JSON.stringify(out, null, 2), { mode: 0o600 });
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1500, height: 950, minWidth: 1000, minHeight: 650, backgroundColor: '#0f172a', title: 'DARKI Code Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl); else void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) void shell.openExternal(url); return { action: 'deny' }; });
}
function safeTarget(root: string, relative: string) {
  const base = path.resolve(root);
  const target = path.resolve(base, relative || '.');
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Path escapes the opened project folder.');
  return target;
}
function assertProject(root: string) {
  if (!root || !path.isAbsolute(root)) throw new Error('Choose a valid project folder first.');
}
async function approve(action: { title: string; detail: string; kind: string; diff?: string }) {
  const mode = settings.approvalMode || 'Ask every time';
  if (mode === 'Auto-allow safe read-only actions' && action.kind === 'read') return true;
  if (mode === 'Auto-allow file edits, ask for commands' && action.kind === 'write') return true;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const id = String(++approvalSeq);
  return new Promise<boolean>(resolve => {
    pendingApprovals.set(id, resolve);
    mainWindow!.webContents.send('approval:request', { id, ...action });
    const timer = setTimeout(() => { const fn = pendingApprovals.get(id); if (fn) { pendingApprovals.delete(id); fn(false); } }, 120_000);
    const original = resolve;
    pendingApprovals.set(id, value => { clearTimeout(timer); original(value); });
  });
}
async function walk(root: string, current = ''): Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>> {
  const dir = safeTarget(root, current);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: Array<{ name: string; path: string; type: 'file' | 'directory' }> = [];
  for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', 'dist', 'release', '.next'].includes(entry.name)) continue;
    const rel = path.posix.join(current.replace(/\\\\/g, '/'), entry.name);
    result.push({ name: entry.name, path: rel, type: entry.isDirectory() ? 'directory' : 'file' });
    if (entry.isDirectory() && current.split('/').length < 4) result.push(...await walk(root, rel));
  }
  return result;
}
async function readProjectFile(root: string, rel: string) {
  assertProject(root); const target = safeTarget(root, rel); const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Only regular files can be read.');
  if (stat.size > 2_000_000) throw new Error('File exceeds 2 MB limit.');
  return fs.readFile(target, 'utf8');
}
async function writeProjectFile(root: string, rel: string, content: string) {
  assertProject(root); if (!rel || !rel.trim()) throw new Error('A relative file path is required.');
  const target = safeTarget(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { const stat = await fs.lstat(target); if (stat.isSymbolicLink() || stat.isDirectory()) throw new Error('Refusing to overwrite a symlink or directory.'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  await fs.writeFile(target, content, 'utf8');
}
async function runCommand(root: string, command: string) {
  assertProject(root);
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { cwd: root, windowsHide: true });
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); if (output.length > 100_000) output = output.slice(-100_000); });
    child.stderr.on('data', d => { output += d.toString(); if (output.length > 100_000) output = output.slice(-100_000); });
    child.on('error', reject); child.on('close', code => resolve({ code, output }));
  });
}
const toolSpecs = [
 {type:'function',function:{name:'list_files',description:'List project files (paths are relative to project root).',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'read_file',description:'Read a text file inside the opened project.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}},
 {type:'function',function:{name:'write_file',description:'Create or replace a project file. Always use the full intended content.',parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content'],additionalProperties:false}}},
 {type:'function',function:{name:'delete_file',description:'Delete a file inside the project. Destructive; requires approval.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}},
 {type:'function',function:{name:'run_command',description:'Run a PowerShell command in the project directory. Requires approval.',parameters:{type:'object',properties:{command:{type:'string'}},required:['command'],additionalProperties:false}}},
 {type:'function',function:{name:'git_status',description:'Get Git branch and working tree status.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'git_commit',description:'Stage all changes and create a commit with the given message. Requires approval.',parameters:{type:'object',properties:{message:{type:'string'}},required:['message'],additionalProperties:false}}},
 {type:'function',function:{name:'git_push',description:'Push the current branch to its configured remote. Requires approval.',parameters:{type:'object',properties:{},additionalProperties:false}}},
 {type:'function',function:{name:'open_preview',description:'Return the likely local preview URL for a project with a dev script.',parameters:{type:'object',properties:{},additionalProperties:false}}}
] as const;

async function executeTool(root: string, name: string, args: Record<string, unknown>) {
  if (name === 'list_files') return JSON.stringify(await walk(root));
  if (name === 'read_file') return await readProjectFile(root, String(args.path || ''));
  if (name === 'write_file') {
    const rel = String(args.path || ''); const content = String(args.content ?? '');
    let before = ''; try { before = await readProjectFile(root, rel); } catch { /* new file */ }
    const diff = 'FILE: ' + rel + '\n--- BEFORE ---\n' + before.slice(0, 8000) + '\n--- PROPOSED ---\n' + content.slice(0, 12000);
    if (!await approve({ title: 'Approve file change', detail: rel, kind: 'write', diff })) return 'DENIED by user. Do not retry the same change without revising the plan.';
    await writeProjectFile(root, rel, content); return 'Saved ' + rel;
  }
  if (name === 'delete_file') {
    const rel = String(args.path || ''); const target = safeTarget(root, rel); const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only regular files can be deleted by the agent.');
    if (!await approve({ title: 'Approve file deletion', detail: rel, kind: 'delete', diff: (await readProjectFile(root, rel)).slice(0, 5000) })) return 'DENIED by user.';
    await fs.unlink(target); return 'Deleted ' + rel;
  }
  if (name === 'run_command') {
    const command = String(args.command || '');
    if (!await approve({ title: 'Run command?', detail: command, kind: 'command' })) return 'DENIED by user.';
    const result = await runCommand(root, command); return JSON.stringify(result);
  }
  if (name === 'git_status') {
    const git = simpleGit(root); const [branch, status] = await Promise.all([git.branch(), git.status()]);
    return JSON.stringify({ branch: branch.current, isClean: status.isClean(), files: status.files.map(f => ({path:f.path,index:f.index,working_dir:f.working_dir})) });
  }
  if (name === 'git_commit') {
    const git = simpleGit(root); const status = await git.status();
    if (!status.files.length) return 'Nothing to commit.';
    const message = String(args.message || 'Changes from DARKI Code Studio');
    if (!await approve({ title: 'Approve Git commit', detail: message + '\n\nChanged files:\n' + status.files.map(f => f.path).join('\n'), kind: 'git' })) return 'DENIED by user.';
    await git.add('.'); const result = await git.commit(message); return JSON.stringify({commit:result.commit,summary:result.summary});
  }
  if (name === 'git_push') {
    const git = simpleGit(root); const status = await git.status(); const branch = await git.branch();
    if (status.files.length) return 'Push blocked: commit or stash working tree changes first.';
    if (!await approve({ title: 'Approve Git push', detail: 'Branch: ' + branch.current + '\nRemote: configured Git remote\nThis publishes committed changes.', kind: 'git' })) return 'DENIED by user.';
    await git.push(); return 'Push completed.';
  }
  if (name === 'open_preview') {
    try { const pkg = JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')) as {scripts?:Record<string,string>}; return pkg.scripts?.dev ? 'Likely preview URL: http://localhost:5173. Start the dev server only after asking the user to approve the command.' : 'No package.json dev script detected.'; } catch { return 'No package.json found. For static HTML, open the HTML file in the preview panel.'; }
  }
  throw new Error('Unknown tool: ' + name);
}

app.whenReady().then(async () => {
  await loadSettings(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  ipcMain.handle('approval:respond', (_e, id: string, approved: boolean) => { const resolve = pendingApprovals.get(id); if (!resolve) return false; pendingApprovals.delete(id); resolve(Boolean(approved)); return true; });
  ipcMain.handle('project:open', async () => { const r = await dialog.showOpenDialog({properties:['openDirectory','createDirectory']}); return r.canceled ? null : r.filePaths[0]; });
  ipcMain.handle('fs:list', async (_e, root: string) => { assertProject(root); return walk(root); });
  ipcMain.handle('fs:read', async (_e, root: string, rel: string) => readProjectFile(root, rel));
  ipcMain.handle('fs:write', async (_e, root: string, rel: string, content: string) => {
    const existing = await fs.readFile(safeTarget(root, rel), 'utf8').catch(()=>'');
    if (!await approve({title:'Save file?',detail:rel,kind:'write',diff:'--- CURRENT ---\n'+existing.slice(0,4000)+'\n--- NEW ---\n'+String(content).slice(0,6000)})) throw new Error('File save denied.');
    await writeProjectFile(root, rel, content);
  });
  ipcMain.handle('openrouter:models', async () => {
    const key = settings.openrouterKey;
    const r = await fetch('https://openrouter.ai/api/v1/models', {headers:key?{Authorization:'Bearer '+key}:{}});
    if (!r.ok) throw new Error('OpenRouter models request failed: '+r.status);
    const d = await r.json() as {data?:Array<{id:string;name?:string;context_length?:number}>};
    return (d.data||[]).map(m=>({id:m.id,name:m.name||m.id,context_length:m.context_length}));
  });
  ipcMain.handle('openrouter:chat', async (_e, req: {root:string; model:string; messages:Array<{role:string;content:string}>; temperature?:number}) => {
    const key=settings.openrouterKey; if(!key) throw new Error('Add your OpenRouter API key in Settings first.');
    assertProject(req.root);
    const messages: Array<Record<string, unknown>> = req.messages.map(m=>({role:m.role,content:m.content}));
    const call = async () => {
      const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','HTTP-Referer':'https://darki.online','X-Title':'DARKI Code Studio'},body:JSON.stringify({model:req.model,messages,temperature:req.temperature??0.2,tools:toolSpecs,tool_choice:'auto'})});
      if(!r.ok) throw new Error('OpenRouter request failed ('+r.status+'): '+(await r.text()).slice(0,400));
      return await r.json() as {choices?:Array<{message?:{role?:string;content?:string|null;tool_calls?:Array<{id:string;function:{name:string;arguments:string}}>};finish_reason?:string}>};
    };
    for(let turn=0;turn<12;turn++){
      const data=await call(); const msg=data.choices?.[0]?.message;
      if(!msg) throw new Error('Model returned no message.');
      if(msg.tool_calls?.length){
        messages.push({role:'assistant',content:msg.content||'',tool_calls:msg.tool_calls});
        for(const tc of msg.tool_calls){
          let result='';
          try { const args=JSON.parse(tc.function.arguments||'{}') as Record<string,unknown>; result=await executeTool(req.root,tc.function.name,args); }
          catch(e){result='Tool error: '+(e instanceof Error?e.message:String(e));}
          messages.push({role:'tool',tool_call_id:tc.id,name:tc.function.name,content:result.slice(0,30000)});
        }
        continue;
      }
      return msg.content||'Done.';
    }
    return 'I reached the maximum number of tool steps for this turn. Please review the files and continue with a focused follow-up.';
  });
  ipcMain.handle('settings:save', async (_e,key:string,value:string) => {
    if(!['openrouterKey','githubToken','defaultModel','approvalMode'].includes(key)) throw new Error('Unsupported setting.');
    settings[key]=value; await persistSettings();
  });
  ipcMain.handle('settings:read', async (_e,key:string) => ['openrouterKey','githubToken'].includes(key)?null:(settings[key]||null));
  ipcMain.handle('git:status', async (_e,root:string) => { assertProject(root); const [b,s]=await Promise.all([simpleGit(root).branch(),simpleGit(root).status()]); return {branch:b.current||'—',status:s.files.length?s.files.length+' changed file(s)':'Clean'}; });
  ipcMain.handle('git:push', async (_e,root:string) => {
    assertProject(root); const git=simpleGit(root); const status=await git.status(); const branch=await git.branch();
    if(status.files.length) throw new Error('Commit your changes before pushing.');
    if(!await approve({title:'Approve Git push',detail:'Branch: '+branch.current+'\nPush committed changes to configured remote?',kind:'git'})) throw new Error('Push denied.');
    await git.push(); return 'Push completed.';
  });
  ipcMain.handle('preview:url', async (_e,root:string) => { assertProject(root); try { const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')) as {scripts?:Record<string,string>}; return pkg.scripts?.dev?'http://localhost:5173':null; } catch { return null; } });
  ipcMain.handle('command:run', async (_e,root:string,command:string) => {
    if(!command.trim()) throw new Error('Command is empty.');
    if(!await approve({title:'Run command?',detail:command,kind:'command'})) throw new Error('Command denied.');
    return runCommand(root,command);
  });
}).catch(err=>{console.error('Startup failed:',err);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});