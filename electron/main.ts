import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import simpleGit from 'simple-git';

let mainWindow: BrowserWindow | null = null;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const settings: Record<string, string> = {};
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
function normalizeGeminiModel(model: string) {
  const normalized = String(model || '').trim().replace(/^models\//, '');
  return !normalized || normalized === 'gemini-2.5-flash' ? DEFAULT_GEMINI_MODEL : normalized;
}
const pendingApprovals = new Map<string, (approved: boolean) => void>();
let approvalSeq = 0;
const aiUndoStack: Array<{root:string;path:string;before:string|null;after:string}> = [];

async function loadSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Record<string, string>;
    for (const [key, value] of Object.entries(raw)) {
      if (key.endsWith('Encrypted') && safeStorage.isEncryptionAvailable()) {
        try { settings[key.replace('Encrypted', '')] = safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { /* old OS key unavailable */ }
      } else if (!['openrouterKey', 'geminiKey', 'githubToken'].includes(key)) settings[key] = value; // Ignore legacy plaintext credentials.
    }
  } catch { /* first run */ }
}
async function persistSettings() {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (['openrouterKey', 'geminiKey', 'githubToken'].includes(key)) {
      if (safeStorage.isEncryptionAvailable()) out[key + 'Encrypted'] = safeStorage.encryptString(value).toString('base64');
      else throw new Error('OS encryption is unavailable; refusing to store API credentials in plaintext.');
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
async function assertSafePath(root:string,relative:string) {
  assertProject(root);
  const base=path.resolve(root);
  const target=safeTarget(root,relative);
  const rel=path.relative(base,target);
  let current=base;
  const parts=rel ? rel.split(path.sep) : [];
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);
    try {
      const stat=await fs.lstat(current);
      if(stat.isSymbolicLink()) throw new Error('Symbolic links are blocked for project operations.');
      if(i<parts.length-1 && !stat.isDirectory()) throw new Error('A parent path component is not a directory.');
    } catch(e) {
      if((e as NodeJS.ErrnoException).code==='ENOENT') break;
      throw e;
    }
  }
  return target;
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
  const dir = await assertSafePath(root, current);
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
  const target = await assertSafePath(root, rel); const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Only regular files can be read.');
  if (stat.size > 2_000_000) throw new Error('File exceeds 2 MB limit.');
  return fs.readFile(target, 'utf8');
}
async function writeProjectFile(root: string, rel: string, content: string) {
  assertProject(root); if (!rel || !rel.trim()) throw new Error('A relative file path is required.');
  const target = await assertSafePath(root, rel);
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
    let before: string | null = null; try { before = await readProjectFile(root, rel); } catch { /* new file */ }
    const diff = 'FILE: ' + rel + '\n--- BEFORE ---\n' + (before ?? '(new file)').slice(0, 8000) + '\n--- PROPOSED ---\n' + content.slice(0, 12000);
    if (!await approve({ title: 'Approve file change', detail: rel, kind: 'write', diff })) return 'DENIED by user. Do not retry the same change without revising the plan.';
    await writeProjectFile(root, rel, content);
    aiUndoStack.push({root,path:rel,before,after:content}); if (aiUndoStack.length > 30) aiUndoStack.shift();
    return 'Saved ' + rel;
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
    const changedPaths=status.files.map(f=>f.path);
    const sensitive=changedPaths.filter(p=>/(^|\/)\.env($|\.(?!example$|sample$))|(^|\/)(id_rsa|credentials\.json)$|\.(pem|p12|key)$/i.test(p));
    if(sensitive.length) throw new Error('Commit blocked because potentially secret files changed: '+sensitive.join(', ')+'. Remove secrets from these files or add safe example files before committing.');
    const message = String(args.message || 'Changes from DARKI Code Studio');
    if (!await approve({ title: 'Approve Git commit', detail: message + '\n\nChanged files:\n' + changedPaths.join('\n'), kind: 'git' })) return 'DENIED by user.';
    await git.add(changedPaths); const result = await git.commit(message); return JSON.stringify({commit:result.commit,summary:result.summary});
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
  ipcMain.handle('project:parent', async () => { const r = await dialog.showOpenDialog({title:'Choose where to create your new project',buttonLabel:'Choose parent folder',properties:['openDirectory','createDirectory']}); return r.canceled ? null : r.filePaths[0]; });
  ipcMain.handle('project:create', async (_e, parent:string, name:string) => {
    assertProject(parent);
    const clean=String(name||'').trim();
    if(!clean || clean==='.' || clean==='..' || (/[<>:"|?*]/.test(clean) || clean.includes('/') || clean.includes('\\')) || /[. ]$/.test(clean)) throw new Error('Enter a valid project folder name.');
    const target=path.resolve(parent,clean);
    if(path.dirname(target)!==path.resolve(parent)) throw new Error('Project must be created directly inside the selected parent folder.');
    await fs.mkdir(target,{recursive:false});
    const files:Record<string,string>={
      'package.json':JSON.stringify({name:clean.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'')||'darki-project',version:'1.0.0',private:true,type:'module',scripts:{dev:'vite --host 127.0.0.1',build:'vite build',preview:'vite preview --host 127.0.0.1'},dependencies:{'@vitejs/plugin-react':'latest',vite:'latest',typescript:'latest',react:'latest','react-dom':'latest'},devDependencies:{}},null,2)+'\\n',
      'index.html':'<!doctype html>\\n<html lang="en">\\n  <head>\\n    <meta charset="UTF-8" />\\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\\n    <meta name="theme-color" content="#09090b" />\\n    <title>'+clean.replace(/[&<>"]/g,'')+'</title>\\n  </head>\\n  <body>\\n    <div id="root"></div>\\n    <script type="module" src="/src/main.tsx"></script>\\n  </body>\\n</html>\\n',
      'src/main.tsx':"import React from 'react';\\nimport { createRoot } from 'react-dom/client';\\nimport App from './App';\\nimport './style.css';\\n\\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);\\n",
      'src/App.tsx':"export default function App() {\\n  return (\\n    <main className=\"page\">\\n      <span className=\"eyebrow\">YOUR NEXT IDEA STARTS HERE</span>\\n      <h1>Build something <span>extraordinary.</span></h1>\\n      <p>Your new project is ready. Edit <code>src/App.tsx</code> and start creating.</p>\\n    </main>\\n  );\\n}\\n",
      'src/style.css':":root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f4f4f5;background:#09090b;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh}.page{max-width:900px;margin:18vh auto;padding:32px}.eyebrow{font-size:12px;letter-spacing:.18em;color:#a1a1aa}.page h1{font-size:clamp(40px,7vw,76px);line-height:1.04;letter-spacing:-.06em}.page h1 span{color:#fb7185}.page p{color:#a1a1aa;line-height:1.8}.page code{color:#fda4af;background:#27272a;padding:3px 7px;border-radius:5px}\\n",
      'tsconfig.json':JSON.stringify({compilerOptions:{target:'ES2020',useDefineForClassFields:true,lib:['ES2020','DOM','DOM.Iterable'],allowJs:false,skipLibCheck:true,esModuleInterop:true,allowSyntheticDefaultImports:true,strict:true,forceConsistentCasingInFileNames:true,module:'ESNext',moduleResolution:'Bundler',resolveJsonModule:true,isolatedModules:true,noEmit:true,jsx:'react-jsx'},include:['src']},null,2)+'\\n',
      'vite.config.ts':"import { defineConfig } from 'vite';\\nimport react from '@vitejs/plugin-react';\\nexport default defineConfig({ plugins: [react()] });\\n"
    };
    for(const [rel,content] of Object.entries(files)){const file=path.join(target,rel);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content,'utf8');}
    return target;
  });
  ipcMain.handle('fs:list', async (_e, root: string) => { assertProject(root); return walk(root); });
  ipcMain.handle('fs:read', async (_e, root: string, rel: string) => readProjectFile(root, rel));
  ipcMain.handle('fs:create', async (_e, root:string, rel:string, type:'file'|'directory') => {
    assertProject(root); const target=await assertSafePath(root,rel);
    if (!rel || rel.split(/[\\\\/]/).some(part=>part==='..')) throw new Error('Invalid project-relative path.');
    if (type==='directory') {
      if (!await approve({title:'Create folder?',detail:rel,kind:'write'})) throw new Error('Creation denied.');
      await fs.mkdir(target,{recursive:false}); return;
    }
    if (!await approve({title:'Create file?',detail:rel,kind:'write'})) throw new Error('Creation denied.');
    await fs.mkdir(path.dirname(target),{recursive:true}); const handle=await fs.open(target,'wx'); await handle.close();
  });
  ipcMain.handle('fs:delete', async (_e,root:string,rel:string) => {
    assertProject(root); const target=await assertSafePath(root,rel); const stat=await fs.lstat(target);
    if(stat.isSymbolicLink()) throw new Error('Refusing to delete symbolic links.');
    if(!await approve({title:'Delete project item?',detail:rel+'\\nThis cannot be undone by the app.',kind:'delete'})) throw new Error('Deletion denied.');
    if(stat.isDirectory()) await fs.rm(target,{recursive:true,force:false}); else await fs.unlink(target);
  });
  ipcMain.handle('fs:rename', async (_e,root:string,from:string,to:string) => {
    assertProject(root); const source=await assertSafePath(root,from), target=await assertSafePath(root,to);
    if(!to || to.split(/[\\\\/]/).some(part=>part==='..')) throw new Error('Invalid destination path.');
    const stat=await fs.lstat(source); if(stat.isSymbolicLink()) throw new Error('Refusing to rename symbolic links.');
    if(!await approve({title:'Rename project item?',detail:from+'  →  '+to,kind:'write'})) throw new Error('Rename denied.');
    await fs.rename(source,target);
  });

  ipcMain.handle('fs:write', async (_e, root: string, rel: string, content: string) => {
    const existing = await readProjectFile(root, rel).catch(()=>'');
    if (!await approve({title:'Save file?',detail:rel,kind:'write',diff:'--- CURRENT ---\n'+existing.slice(0,4000)+'\n--- NEW ---\n'+String(content).slice(0,6000)})) throw new Error('File save denied.');
    await writeProjectFile(root, rel, content);
  });
  ipcMain.handle('openrouter:models', async (_e, provider: 'openrouter'|'gemini' = 'openrouter') => {
    if(provider==='gemini') {
      const key=settings.geminiKey; if(!key) return [];
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models',{headers:{Authorization:'Bearer '+key}});
      if(!r.ok) throw new Error('Gemini models request failed: '+r.status);
      const d=await r.json() as {data?:Array<{id:string;name?:string}>};
      return (d.data||[]).filter(m=>m.id.replace(/^models\//,'').startsWith('gemini-')).map(m=>{const id=normalizeGeminiModel(m.id);return {id,name:m.name||id,isFree:false};}).sort((a,b)=>Number(b.id===DEFAULT_GEMINI_MODEL)-Number(a.id===DEFAULT_GEMINI_MODEL));
    }
    const key = settings.openrouterKey;
    const r = await fetch('https://openrouter.ai/api/v1/models', {headers:key?{Authorization:'Bearer '+key}:{}});
    if (!r.ok) throw new Error('OpenRouter models request failed: '+r.status);
    const d = await r.json() as {data?:Array<{id:string;name?:string;context_length?:number;pricing?:{prompt?:string;completion?:string}}>};
    return (d.data||[]).map(m=>({id:m.id,name:m.name||m.id,context_length:m.context_length,isFree:m.id.endsWith(':free')||(Number(m.pricing?.prompt)===0&&Number(m.pricing?.completion)===0)}));
  });
  ipcMain.handle('openrouter:chat', async (_e, req: {root:string; requestId?:string; model:string; messages:Array<{role:string;content:string}>; temperature?:number; autoFallback?:boolean; fallbackModels?:string[]; provider?:'openrouter'|'gemini'}) => {
    const provider=req.provider==='gemini'?'gemini':'openrouter';
    const key=provider==='gemini'?settings.geminiKey:settings.openrouterKey;
    if(!key) throw new Error('Add your '+(provider==='gemini'?'Gemini':'OpenRouter')+' API key in Settings first.');
    assertProject(req.root);
    const messages: Array<Record<string, unknown>> = req.messages.map(m=>({role:m.role,content:m.content}));
    const call = async () => {
      const r=await fetch(provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(provider==='openrouter'?{'HTTP-Referer':'https://darki.online','X-Title':'DARKI Code Studio'}:{})},body:JSON.stringify({model:provider==='gemini'?normalizeGeminiModel(req.model):req.model,...(provider==='openrouter'&&req.autoFallback!==false&&req.fallbackModels?.length?{models:[...new Set(req.fallbackModels.filter(m=>m&&m!==req.model))]}:{}),messages,temperature:req.temperature??0.2,tools:toolSpecs,tool_choice:'auto',stream:true})});
      if(!r.ok) throw new Error(provider+' request failed ('+r.status+'): '+(await r.text()).slice(0,400));
      if(!r.body) throw new Error('Streaming response body unavailable.');
      const reader=r.body.getReader(); const decoder=new TextDecoder(); let buffer=''; let content=''; let finishReason:string|undefined;
      const calls:Record<number,{id:string;type:'function';function:{name:string;arguments:string}}>= {};
      const consume=(line:string)=>{
        if(!line.startsWith('data:')) return;
        const raw=line.slice(5).trim(); if(!raw||raw==='[DONE]') return;
        let payload:{choices?:Array<{delta?:{content?:string|null;tool_calls?:Array<{index?:number;id?:string;type?:'function';function?:{name?:string;arguments?:string}}>};finish_reason?:string}>};
        try{payload=JSON.parse(raw);}catch{return;}
        const choice=payload.choices?.[0]; if(!choice)return;
        if(choice.finish_reason)finishReason=choice.finish_reason;
        const delta=choice.delta;
        if(typeof delta?.content==='string'&&delta.content){
          content+=delta.content;
          if(req.requestId&&mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('chat:chunk',{requestId:req.requestId,chunk:delta.content});
        }
        for(const item of delta?.tool_calls||[]){
          const index=item.index??0;
          if(!calls[index])calls[index]={id:item.id||'',type:'function',function:{name:'',arguments:''}};
          if(item.id)calls[index].id=item.id;
          if(item.function?.name)calls[index].function.name+=item.function.name;
          if(item.function?.arguments)calls[index].function.arguments+=item.function.arguments;
        }
      };
      while(true){
        const {done,value}=await reader.read(); if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split(/\r?\n/); buffer=lines.pop()||'';
        for(const line of lines)consume(line);
      }
      if(buffer)consume(buffer);
      const toolCalls=Object.keys(calls).map(Number).sort((a,b)=>a-b).map(i=>calls[i]);
      return {choices:[{message:{role:'assistant',content:content||null,tool_calls:toolCalls.length?toolCalls:undefined},finish_reason:finishReason}]};
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
    if(!['openrouterKey','geminiKey','githubToken','defaultModel','approvalMode','autoFallback','fallbackModels','modelProvider','geminiModel'].includes(key)) throw new Error('Unsupported setting.');
    settings[key]=key==='geminiModel'?normalizeGeminiModel(value):value; await persistSettings();
  });
  ipcMain.handle('settings:read', async (_e,key:string) => ['openrouterKey','geminiKey','githubToken'].includes(key)?null:(settings[key]||null));
  ipcMain.handle('github:action', async (_e, action:string, args:Record<string,string>) => {
    const token=settings.githubToken;
    const api=async (url:string,init:RequestInit={})=>{
      if(!token) throw new Error('Add a GitHub Personal Access Token in Settings first.');
      const response=await fetch('https://api.github.com'+url,{...init,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...(init.headers||{})}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error('GitHub API '+response.status+': '+String((body as {message?:string}).message||'Request failed'));
      return body as Record<string,unknown>;
    };
    if(action==='login'){const user=await api('/user');return 'Connected to GitHub as '+String(user.login||'unknown')+'.';}
    if(action==='create-repo'){
      const name=args.name?.trim();if(!name)throw new Error('Repository name is required.');
      if(!await approve({title:'Create GitHub repository?',detail:name+'\\nVisibility: '+(args.private!=='false'?'private':'public'),kind:'git'}))return 'DENIED by user.';
      const result=await api('/user/repos',{method:'POST',body:JSON.stringify({name,private:args.private!=='false',auto_init:true})});
      return 'Created repository: '+String(result.html_url||result.full_name);
    }
    if(action==='clone'){
      const url=args.url?.trim(),destination=args.destination?.trim();if(!url||!destination)throw new Error('Repository URL and destination path are required.');
      if(!await approve({title:'Clone GitHub repository?',detail:url+'\\nDestination: '+destination,kind:'command'}))return 'DENIED by user.';
      await simpleGit().clone(url,destination);return 'Cloned repository into '+destination;
    }
    if(action==='pull'){
      assertProject(args.root||'');if(!await approve({title:'Pull latest Git changes?',detail:'Project: '+args.root,kind:'git'}))return 'DENIED by user.';
      const result=await simpleGit(args.root).pull();return JSON.stringify({summary:result.summary,files:result.files});
    }
    if(action==='branch'){
      assertProject(args.root||'');const name=args.name?.trim();if(!name)throw new Error('Branch name is required.');
      if(!await approve({title:'Create Git branch?',detail:name,kind:'git'}))return 'DENIED by user.';
      await simpleGit(args.root).checkoutLocalBranch(name);return 'Created and switched to '+name;
    }
    if(action==='switch'){
      assertProject(args.root||'');const name=args.name?.trim();if(!name)throw new Error('Branch name is required.');
      if(!await approve({title:'Switch Git branch?',detail:name,kind:'git'}))return 'DENIED by user.';
      const git=simpleGit(args.root);const status=await git.status();if(!status.isClean())throw new Error('Commit or stash changes before switching branches.');
      await git.checkout(name);return 'Switched to '+name;
    }
    if(action==='pr'){
      const owner=args.owner?.trim(),repoName=args.repo?.trim(),title=args.title?.trim(),head=args.head?.trim(),base=args.base?.trim()||'main';
      if(!owner||!repoName||!title||!head)throw new Error('Owner, repository, title and head branch are required.');
      if(!await approve({title:'Create GitHub pull request?',detail:owner+'/'+repoName+'\\n'+head+' → '+base+'\\n'+title,kind:'git'}))return 'DENIED by user.';
      const result=await api('/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repoName)+'/pulls',{method:'POST',body:JSON.stringify({title,head,base,body:args.body||'Created with DARKI Code Studio'})});
      return 'Pull request created: '+String(result.html_url||'success');
    }
    throw new Error('Unknown GitHub action.');
  });
  ipcMain.handle('undo:last', async (_e,root:string) => {
    assertProject(root); const item=aiUndoStack[aiUndoStack.length-1];
    if(!item || item.root!==root) throw new Error('No AI file edit to undo for this project.');
    if(!await approve({title:'Undo last AI file edit?',detail:item.path,kind:'write',diff:'--- CURRENT AI VERSION ---\\n'+item.after.slice(0,6000)+'\\n--- RESTORE ---\\n'+(item.before??'(file will be deleted)')})) throw new Error('Undo denied.');
    const target=await assertSafePath(root,item.path);
    if(item.before===null) await fs.unlink(target); else await writeProjectFile(root,item.path,item.before);
    aiUndoStack.pop(); return 'Undid last AI edit to '+item.path;
  });
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