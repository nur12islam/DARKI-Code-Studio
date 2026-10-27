import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Activity, Bot, ChevronDown, Code2, Command, FileCode2, Folder, FolderOpen, GitBranch, Github, Globe, MessageSquare, PanelBottom, Play, Plus, RefreshCw, Save, Settings, ShieldCheck, Sparkles, Terminal, Upload, X } from 'lucide-react';
import { useStudio } from './lib/store';

const id = () => Math.random().toString(36).slice(2);
export default function App() {
  const { root, activeFile, fileContent, dirty, model, messages, set } = useStudio();
  const [files, setFiles] = useState<Array<{name:string;path:string;type:'file'|'directory'}>>([]);
  const [models, setModels] = useState<Array<{id:string;name:string}>>([]);
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'chat'|'preview'>('chat');
  const [bottom, setBottom] = useState(true);
  const [logs, setLogs] = useState<string[]>(['DARKI Code Studio ready.', 'Secrets are stored by the Electron main process when OS encryption is available.']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [approval, setApproval] = useState('Ask every time');
  const [preview, setPreview] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [filter, setFilter] = useState('');
  const [branch, setBranch] = useState('—');
  const [pendingApproval, setPendingApproval] = useState<{id:string;title:string;detail:string;kind:string;diff?:string}|null>(null);

  const refreshFiles = async (folder = root) => { if (!folder) return; try { setFiles(await window.studio.listFiles(folder)); } catch(e) { log(String(e)); } };
  function log(message: string) { setLogs(prev => [...prev.slice(-150), message]); }
  useEffect(() => window.studio.onApproval(request => setPendingApproval(request)), []);
  useEffect(() => {
    void window.studio.models().then(setModels).catch(e => log('Models: ' + e.message));
    void window.studio.readSetting('defaultModel').then(v => { if(v) set({model:v}); });
    void window.studio.readSetting('approvalMode').then(v => { if(v) setApproval(v); });
  }, []);
  useEffect(() => { if(root) { void refreshFiles(root); void window.studio.gitStatus(root).then(s=>setBranch(s.branch)).catch(()=>setBranch('No Git')); void window.studio.previewUrl(root).then(v=>setPreview(v||'')); } }, [root]);
  const filteredModels = useMemo(() => models.filter(m => (m.name+' '+m.id).toLowerCase().includes(modelSearch.toLowerCase())).slice(0,100), [models, modelSearch]);
  async function openFolder() { const folder = await window.studio.openFolder(); if(folder) { set({root:folder,activeFile:null,fileContent:'',dirty:false,messages:[]}); log('Opened ' + folder); } }
  async function openFile(file: string) { if(!root) return; try { const content = await window.studio.readFile(root,file); set({activeFile:file,fileContent:content,dirty:false}); } catch(e) { log('Read failed: '+String(e)); } }
  async function createItem(type:'file'|'directory') {
    if(!root) { log('Open a project folder first.'); return; }
    const rel=prompt(type==='file'?'New file path (relative to project root):':'New folder path (relative to project root):',type==='file'?'src/new-file.ts':'new-folder');
    if(!rel) return;
    try { await window.studio.createItem(root,rel,type); await refreshFiles(); log('Created '+rel); if(type==='file') await openFile(rel); }
    catch(e) { log('Create failed: '+String(e)); alert(String(e)); }
  }
  async function renameActive() {
    if(!root||!activeFile) return;
    const to=prompt('Rename/move to project-relative path:',activeFile); if(!to||to===activeFile) return;
    try { await window.studio.renameItem(root,activeFile,to); set({activeFile:null,fileContent:'',dirty:false}); await refreshFiles(); log('Renamed '+activeFile+' to '+to); }
    catch(e) { log('Rename failed: '+String(e)); alert(String(e)); }
  }
  async function deleteActive() {
    if(!root||!activeFile) return;
    if(!confirm('Delete '+activeFile+'? The app will ask for a second approval.')) return;
    try { await window.studio.deleteItem(root,activeFile); log('Deleted '+activeFile); set({activeFile:null,fileContent:'',dirty:false}); await refreshFiles(); }
    catch(e) { log('Delete failed: '+String(e)); alert(String(e)); }
  }
  async function saveFile() { if(!root||!activeFile) return; try { await window.studio.writeFile(root,activeFile,fileContent); set({dirty:false}); log('Saved '+activeFile); await refreshFiles(); if(preview) setPreview(preview+''); } catch(e) { log('Save failed: '+String(e)); } }
  useEffect(() => { const handler = (e: KeyboardEvent) => { if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void saveFile();} }; window.addEventListener('keydown',handler); return()=>window.removeEventListener('keydown',handler); });
  async function send() {
    if (!input.trim() || busy) return;
    const user = { role: 'user' as const, content: input.trim(), id: id() };
    const next = [...messages, user];
    set({ messages: next }); setInput(''); setBusy(true);
    if (!root) {
      set({ messages: [...next, { role: 'assistant', content: 'Open a project folder first so I can inspect and work on its files.', id: id() }] });
      setBusy(false); return;
    }
    try {
      const system = 'You are DARKI Code Studio, an autonomous coding agent operating inside the user-selected project folder. First inspect files with list_files/read_file before proposing edits. You may use write_file, delete_file, run_command, git_status, git_commit, git_push and open_preview. All write/delete/command/commit/push operations trigger a user Allow/Deny approval request; never attempt to bypass approval. Make focused changes, explain what you changed, and verify with suitable read-only inspection or tests after changes. Do not claim a tool succeeded unless its result confirms success. Never access paths outside the opened project. For commands, prefer safe project-specific tests/build commands and explain destructive commands. If denied, adapt rather than retrying the same action.';
      const answer = await window.studio.chat({ root, model, messages: [{ role: 'system', content: system + '\\nCurrent project root: ' + root + '\\nCurrent editor file: ' + (activeFile || '(none)') + '\\nRead files before assuming their contents.' }, ...next.map(m => ({ role: m.role, content: m.content }))], temperature: 0.2 });
      set({ messages: [...next, { role: 'assistant', content: answer, id: id() }] });
      void refreshFiles(); void window.studio.gitStatus(root).then(s => setBranch(s.branch)).catch(() => undefined);
    } catch (e) {
      set({ messages: [...next, { role: 'assistant', content: '**Request failed:** ' + String(e), id: id() }] });
    } finally { setBusy(false); }
  }

  async function undoLastAIEdit() {
    if(!root){alert('Open a project folder first.');return;}
    try { const result=await window.studio.undoLast(root);log(result);await refreshFiles();if(activeFile){try{const content=await window.studio.readFile(root,activeFile);set({fileContent:content,dirty:false});}catch{set({activeFile:null,fileContent:'',dirty:false});}} }
    catch(e){log('Undo failed: '+String(e));alert(String(e));}
  }
  async function runGitHubAction() {
    const action=prompt('GitHub action: login, create-repo, clone, pull, branch, switch, pr','login')?.trim().toLowerCase();
    if(!action) return;
    const args:Record<string,string>={root:root||''};
    if(action==='create-repo') { const name=prompt('New repository name:'); if(!name)return; args.name=name; args.private=confirm('Create as a private repository?')?'true':'false'; }
    if(action==='clone') { const url=prompt('Repository HTTPS URL:'); if(!url)return; const dest=prompt('Absolute destination folder path (must not already exist):'); if(!dest)return; args.url=url;args.destination=dest; }
    if(action==='branch'||action==='switch') { if(!root){alert('Open a project folder first.');return;} const name=prompt(action==='branch'?'New branch name:':'Branch name to switch to:');if(!name)return;args.name=name; }
    if(action==='pull'&&!root){alert('Open a project folder first.');return;}
    if(action==='pr') {
      args.owner=prompt('GitHub owner (e.g. nur12islam):')||'';args.repo=prompt('Repository name:')||'';args.title=prompt('Pull request title:')||'';args.head=prompt('Head/source branch:')||'';args.base=prompt('Base/target branch:','main')||'main';args.body=prompt('Pull request description:')||'Created with DARKI Code Studio';
      if(!args.owner||!args.repo||!args.title||!args.head)return;
    }
    try { const result=await window.studio.githubAction(action,args);log(result);alert(result);if(root){void window.studio.gitStatus(root).then(s=>setBranch(s.branch)).catch(()=>undefined);void refreshFiles();} }
    catch(e){log('GitHub action failed: '+String(e));alert(String(e));}
  }\n  async function saveSettings() { if(apiKey.trim()) await window.studio.saveSetting('openrouterKey',apiKey.trim()); if(githubToken.trim()) await window.studio.saveSetting('githubToken',githubToken.trim()); await window.studio.saveSetting('defaultModel',model); await window.studio.saveSetting('approvalMode',approval); setApiKey(''); setGithubToken(''); setSettingsOpen(false); log('Settings saved.'); void window.studio.models().then(setModels).catch(e=>log(String(e))); }
  async function push() { if(!root) return; if(!confirm('Push the current Git branch to its configured remote? This does not create a commit.')) return; try { log(await window.studio.push(root)); } catch(e) { log('Push blocked/failed: '+String(e)); } }
  async function runCommand() { if(!root||!terminalCommand.trim()) return; const cmd=terminalCommand; if(!confirm('Allow this command to run in the opened project folder?\n\n'+cmd)) { log('Denied command: '+cmd); return; } setTerminalOutput('Running: '+cmd+'\n'); try { const r=await window.studio.runCommand(root,cmd); setTerminalOutput(r.output+'\nExit code: '+r.code); log('Command exited with '+r.code); } catch(e) { setTerminalOutput(String(e)); } }
  const fileName = (p:string) => p.split('/').pop() || p;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Code2 size={19}/></div><div><strong>DARKI<span> CODE</span></strong><small>STUDIO</small></div></div>
      <div className="top-project"><Folder size={15}/><span>{root?fileName(root.replace(/\\/g,'/')):'No project opened'}</span><span className="branch"><GitBranch size={13}/>{branch}</span></div>
      <div className="top-actions"><div className="model-wrap"><button className="model-button" onClick={()=>setModelOpen(!modelOpen)}><Sparkles size={15}/>{model}<ChevronDown size={14}/></button>{modelOpen&&<div className="model-pop"><input placeholder="Search models…" value={modelSearch} onChange={e=>setModelSearch(e.target.value)}/><div className="model-list">{filteredModels.map(m=><button key={m.id} onClick={()=>{set({model:m.id});setModelOpen(false);void window.studio.saveSetting('defaultModel',m.id);}}><span>{m.name}</span><small>{m.id}</small></button>)}</div></div>}</div><button className="icon-button" title="Undo last AI edit" onClick={()=>void undoLastAIEdit()}><RefreshCw size={15}/></button><button className="icon-button" title="GitHub actions" onClick={()=>void runGitHubAction()}><Github size={16}/></button><button className="icon-button" title="Settings" onClick={()=>setSettingsOpen(true)}><Settings size={17}/></button><button className="push-button" onClick={()=>void push()}><Upload size={14}/> Push</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar"><button className="open-folder" onClick={()=>void openFolder()}><FolderOpen size={16}/> Open Folder</button><div className="section-label">EXPLORER <span className="explorer-tools"><button title="New file" onClick={()=>void createItem("file")}><Plus size={13}/></button><button title="New folder" onClick={()=>void createItem("directory")}><Folder size={13}/></button><button title="Refresh" onClick={()=>void refreshFiles()}><RefreshCw size={13}/></button></span></div><input className="filter-input" placeholder="Filter files…" value={filter} onChange={e=>setFilter(e.target.value)}/><div className="file-tree">{files.filter(f=>f.path.toLowerCase().includes(filter.toLowerCase())).map(f=><button className={'tree-row '+(activeFile===f.path?'selected':'')} key={f.path} style={{paddingLeft:10+f.path.split('/').length*10}} onClick={()=>f.type==='file'?void openFile(f.path):undefined}><span>{f.type==='directory'?'▸':'·'}</span>{f.type==='directory'?<Folder size={14}/>:<FileCode2 size={14}/>}<span>{f.name}</span></button>)}{root&&!files.length&&<p className="muted small">No files found.</p>}{!root&&<div className="empty-tree"><Folder size={24}/><p>Open a folder to start</p></div>}</div><div className="sidebar-bottom"><div className="section-label">RECENT PROJECTS</div>{root&&<button className="recent-row" onClick={()=>void openFolder()}><Folder size={14}/>{fileName(root.replace(/\\/g,'/'))}</button>}<div className="sidebar-foot"><span className="status-dot"/> Local workspace <span className="version">v0.1.0</span></div></div></aside>
      <main className="editor-area"><div className="editor-tabs">{activeFile?<div className="editor-tab active"><FileCode2 size={14}/>{fileName(activeFile)}{dirty&&<span className="dirty-dot"/>}<button title="Close tab" onClick={()=>set({activeFile:null,fileContent:'',dirty:false})}><X size={12}/></button></div>:<div className="welcome-tab"><Code2 size={14}/> Workspace</div>}<div className="editor-tab-actions">{activeFile&&<><button className="save-button" onClick={()=>void saveFile()}><Save size={13}/> Save</button><button className="save-button" title="Rename file" onClick={()=>void renameActive()}>Rename</button><button className="save-button danger-button" title="Delete file" onClick={()=>void deleteActive()}>Delete</button></>}<span className="language-pill">{activeFile?.split('.').pop()||'WELCOME'}</span></div></div>
        {activeFile?<Editor height="100%" theme="vs-dark" path={activeFile} value={fileContent} onChange={v=>set({fileContent:v||'',dirty:true})} options={{fontSize:14,minimap:{enabled:false},wordWrap:'on',automaticLayout:true,scrollBeyondLastLine:false,padding:{top:14},fontFamily:'Cascadia Code, Consolas, monospace'}}/>:<div className="welcome"><div className="welcome-icon"><Code2 size={30}/></div><p className="eyebrow">YOUR WORKSPACE, REIMAGINED</p><h1>Build something<br/><span>extraordinary.</span></h1><p className="welcome-copy">Your projects. Your models. Your workflow.<br/>Everything in one focused space.</p><div className="welcome-actions"><button className="primary" onClick={()=>void openFolder()}><FolderOpen size={16}/> Open a project</button><button className="secondary" onClick={()=>setSettingsOpen(true)}><Settings size={16}/> Configure AI</button></div><div className="feature-row"><div><Sparkles size={16}/><b>Multi-model AI</b><small>Powered by OpenRouter</small></div><div><ShieldCheck size={16}/><b>You stay in control</b><small>Local files, your approval</small></div><div><Github size={16}/><b>GitHub ready</b><small>Review before you push</small></div></div></div>}
        <div className="editor-status"><span>{activeFile?'UTF-8 · '+(activeFile.split('.').pop()||'text'):'Ready'}</span><span>{dirty?'● Unsaved changes':'All changes saved'}</span><span>Ln 1, Col 1</span></div>
      </main>
      <section className="right-panel"><div className="panel-tabs"><button className={panel==='chat'?'active':''} onClick={()=>setPanel('chat')}><MessageSquare size={15}/> AI Chat</button><button className={panel==='preview'?'active':''} onClick={()=>setPanel('preview')}><Globe size={15}/> Live Preview</button><button className="panel-icon" title="Refresh preview" onClick={()=>{if(preview)setPreview(preview+'?refresh='+Date.now());}}><RefreshCw size={14}/></button></div>
        {panel==='chat'?<><div className="chat-heading"><div className="assistant-avatar"><Bot size={17}/></div><div><b>DARKI Assistant</b><small>{model}</small></div><span className="online-dot"/></div><div className="chat-messages">{messages.length===0&&<div className="chat-empty"><div className="chat-spark"><Sparkles size={20}/></div><h3>What are we building?</h3><p>Describe a feature, ask a question, or get help understanding your code.</p><div className="prompt-chips"><button onClick={()=>setInput('Explain the architecture of this project.')}>Explain this project</button><button onClick={()=>setInput('Help me debug the current issue.')}>Debug an issue</button><button onClick={()=>setInput('Suggest improvements for this codebase.')}>Improve my code</button></div></div>}{messages.map(m=><div className={'message '+m.role} key={m.id}><div className="message-label">{m.role==='user'?'YOU':'✦ DARKI AI'}</div><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div></div>)}{busy&&<div className="thinking"><span/><span/><span/> Thinking…</div>}</div><div className="chat-composer"><div className="composer-tools"><span><Sparkles size={12}/> {model}</span><span>Enter to send</span></div><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}} placeholder="Ask anything about your code…" rows={3}/><div className="composer-bottom"><button className="attach-button" title="Open project" onClick={()=>void openFolder()}><Plus size={17}/></button><span className="composer-hint">AI can make mistakes. Review changes.</span><button className="send-button" disabled={busy||!input.trim()} onClick={()=>void send()}>{busy?'…':'↑'}</button></div></div></>:<div className="preview-panel"><div className="preview-toolbar"><span className="preview-dot"/><input value={preview} onChange={e=>setPreview(e.target.value)} placeholder="Preview URL (e.g. http://localhost:5173)"/><button onClick={()=>{const f=activeFile?.endsWith('.html')?activeFile:'';if(f&&root)setPreview('file://'+root+'/'+f);}} title="Use current HTML file"><FileCode2 size={14}/></button></div>{preview?<iframe title="Live Preview" src={preview} sandbox="allow-scripts allow-forms allow-same-origin" />:<div className="preview-empty"><Globe size={28}/><b>Preview your project</b><p>Enter a local development URL above, or open a project with a running dev server.</p><button className="secondary" onClick={()=>{setPanel('chat');setInput('Help me start the local development server for this project.');}}>Set up preview <Play size={13}/></button></div>}</div>}
      </section>
    </div>
    <section className={'bottom-panel '+(!bottom?'collapsed':'')}><div className="bottom-head"><button onClick={()=>setBottom(!bottom)}><PanelBottom size={14}/>{bottom?'TERMINAL & LOGS':'SHOW TERMINAL & LOGS'}<ChevronDown size={13}/></button><div className="bottom-tabs"><span className="active"><Terminal size={13}/> Terminal</span><span><Activity size={13}/> Action history ({logs.length})</span></div><button className="panel-icon" onClick={()=>{setLogs([]);setTerminalOutput('');}} title="Clear logs"><X size={14}/></button></div>{bottom&&<div className="terminal-body"><div className="terminal-run"><span className="terminal-prompt">PS ›</span><input value={terminalCommand} onChange={e=>setTerminalCommand(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runCommand();}} placeholder="Enter a command — you'll be asked to approve it"/><button onClick={()=>void runCommand()}><Play size={13}/> Run</button></div><pre>{terminalOutput||logs.slice(-5).join('\n')}</pre></div>}</section>
    {pendingApproval&&<div className="modal-backdrop approval-backdrop"><div className="settings-modal approval-modal"><div className="modal-title"><div><ShieldCheck size={19}/><h2>{pendingApproval.title}</h2></div><span className="approval-badge">AWAITING APPROVAL</span></div><p className="modal-description">The agent is paused. Review this action before it touches your project or runs a command.</p><div className="approval-detail"><b>{pendingApproval.kind.toUpperCase()}</b><pre>{pendingApproval.detail}</pre></div>{pendingApproval.diff&&<details className="approval-diff" open><summary>Review file content / proposed diff</summary><pre>{pendingApproval.diff}</pre></details>}<div className="modal-warning"><ShieldCheck size={16}/><span>Only allow this if you understand and trust the requested change. Commands can modify files or access the network.</span></div><div className="modal-actions"><button className="secondary" onClick={()=>{void window.studio.respondApproval(pendingApproval.id,false);log('Denied: '+pendingApproval.title);setPendingApproval(null);}}>Deny</button><button className="primary" onClick={()=>{void window.studio.respondApproval(pendingApproval.id,true);log('Allowed: '+pendingApproval.title);setPendingApproval(null);}}>Allow action</button></div></div></div>}
    {settingsOpen&&<div className="modal-backdrop" onClick={()=>setSettingsOpen(false)}><div className="settings-modal" onClick={e=>e.stopPropagation()}><div className="modal-title"><div><Settings size={18}/><h2>Studio settings</h2></div><button onClick={()=>setSettingsOpen(false)}><X size={17}/></button></div><p className="modal-description">Configure your model provider and workspace preferences.</p><label>OpenRouter API key<input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Paste key (leave blank to keep saved key)"/></label><p className="field-note">Stored through Electron safeStorage where OS encryption is available. Never commit this key.</p><label>GitHub Personal Access Token<input type="password" autoComplete="off" value={githubToken} onChange={e=>setGithubToken(e.target.value)} placeholder="Paste token (leave blank to keep saved token)"/></label><p className="field-note">Used for GitHub login, repository creation and pull requests. Stored encrypted through Electron safeStorage.</p><label>Default model<select value={model} onChange={e=>set({model:e.target.value})}>{models.map(m=><option key={m.id} value={m.id}>{m.name} — {m.id}</option>)}{!models.length&&<option value={model}>{model}</option>}</select></label><label>Approval mode<select value={approval} onChange={e=>setApproval(e.target.value)}><option>Ask every time</option><option>Auto-allow file edits, ask for commands</option><option>Auto-allow safe read-only actions</option></select></label><div className="modal-warning"><ShieldCheck size={16}/><span>This starter currently asks before terminal commands and Git push. AI file-edit tools and the full approval queue are not yet wired up.</span></div><div className="modal-actions"><button className="secondary" onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="primary" onClick={()=>void saveSettings()}>Save settings</button></div></div></div>}
  </div>;
}