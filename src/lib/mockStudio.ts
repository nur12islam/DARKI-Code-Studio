import type {
  AgentEvent,
  ApprovalRequest,
  GithubRepo,
  ModelInfo,
  Provider,
  PublicSettings,
  SearchMatch,
  StudioBridge,
  TreeEntry
} from './types';
import { compareTreeEntries } from './utils';

const ROOT = 'C:\\Users\\you\\Projects\\aurora-studio';

const demoFiles: Record<string, string> = {
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aurora Studio</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'package.json': `{
  "name": "aurora-studio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
`,
  'README.md': `# Aurora Studio

A calm, editorial workspace for creative teams. Built with React and Vite.

## Start

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
  '.gitignore': `node_modules
dist
.env
`,
  'src/main.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
  'src/App.tsx': `import { Hero } from './components/Hero';
import { ProjectGrid } from './components/ProjectGrid';

export default function App() {
  return (
    <main className="shell">
      <nav className="nav">
        <span className="wordmark">AURORA</span>
        <span className="nav-links">Work · Studio · Contact</span>
      </nav>
      <Hero />
      <ProjectGrid />
    </main>
  );
}
`,
  'src/styles.css': `:root {
  color-scheme: dark;
  font-family: Inter, system-ui, sans-serif;
  color: #f3f4f6;
  background: #080b11;
}
* { box-sizing: border-box; }
body { margin: 0; }
.shell { max-width: 1120px; margin: 0 auto; padding: 32px; }
.nav { display: flex; justify-content: space-between; align-items: center; }
.wordmark { letter-spacing: .3em; color: #6ee7f9; }
`,
  'src/components/Hero.tsx': `export function Hero() {
  return (
    <section className="hero">
      <span className="eyebrow">STUDIO — 2026</span>
      <h1>We design calm products for noisy worlds.</h1>
      <p>Independent design engineering practice for ambitious software teams.</p>
    </section>
  );
}
`,
  'src/components/ProjectGrid.tsx': `const projects = [
  { name: 'Northwind', type: 'Product design' },
  { name: 'Tidal', type: 'Brand system' },
  { name: 'Lumen', type: 'Design engineering' }
];

export function ProjectGrid() {
  return (
    <section className="projects">
      {projects.map(project => (
        <article key={project.name}>
          <h2>{project.name}</h2>
          <p>{project.type}</p>
        </article>
      ))}
    </section>
  );
}
`,
  'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`,
  'tsconfig.json': `{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ESNext",\n    "jsx": "react-jsx",\n    "strict": true\n  }\n}\n`
};

const demoPreview = `<!doctype html><html><head><style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;color:#e5eefc;background:#080b11}
body{margin:0;display:grid;place-items:center;min-height:100vh}
main{max-width:640px;padding:56px;border:1px solid #1d2940;border-radius:24px;background:linear-gradient(150deg,#101a2b,#0a0e16);box-shadow:0 40px 120px #0009}
span{color:#67e8f9;letter-spacing:.24em;font-size:11px}h1{font-size:44px;line-height:1.05;margin:16px 0;letter-spacing:-.04em}p{color:#94a3b8;line-height:1.7}
</style></head><body><main><span>AURORA STUDIO — PREVIEW</span><h1>We design calm products for noisy worlds.</h1><p>Independent design engineering practice for ambitious software teams.</p></main></body></html>`;

const blobPreview = URL.createObjectURL(new Blob([demoPreview], { type: 'text/html' }));

const demoModels: Record<Provider, ModelInfo[]> = {
  gemini: [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', description: 'Fast agentic coding model', contextLength: 1_000_000, recommended: true, supportsTools: true },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', description: 'Previous generation Flash', contextLength: 1_000_000, supportsTools: true },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: 'Deep reasoning and planning', contextLength: 2_000_000, supportsTools: true },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', description: 'Low latency and low cost', contextLength: 1_000_000, supportsTools: true }
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', description: 'Strong coding and tool use', contextLength: 200_000, supportsTools: true, inputPrice: 3, outputPrice: 15 },
    { id: 'openai/gpt-5.2', name: 'GPT-5.2', description: 'General reasoning model', contextLength: 400_000, supportsTools: true, inputPrice: 2, outputPrice: 10 },
    { id: 'deepseek/deepseek-v4', name: 'DeepSeek V4', description: 'Efficient coding model', contextLength: 256_000, supportsTools: true, isFree: false },
    { id: 'openrouter/free', name: 'OpenRouter Free Router', description: 'Automatically routes to a free model', contextLength: 128_000, supportsTools: true, isFree: true }
  ]
};

type Listener<T> = (payload: T) => void;

export function installMockStudio() {
  let settings: PublicSettings = {
    modelProvider: 'gemini',
    geminiModel: 'gemini-3.8-flash',
    openrouterModel: 'openrouter/free',
    approvalMode: 'ask',
    autoFallback: true,
    fallbackModels: 'openrouter/free',
    editorFontSize: 14,
    editorWordWrap: true,
    temperature: 0.2,
    recentProjects: ['C:\\Users\\you\\Projects\\aurora-studio', 'C:\\Users\\you\\Projects\\northwind-app'],
    lastProjectRoot: ROOT,
    githubLogin: null,
    hasGeminiKey: false,
    geminiKeyHint: null,
    hasOpenRouterKey: false,
    openrouterKeyHint: null,
    hasGithubToken: false,
    githubTokenHint: null,
    encryptionAvailable: true,
    settingsPath: 'C:\\Users\\you\\AppData\\Roaming\\DARKI Code Studio\\settings.json'
  };
  const files = { ...demoFiles };
  const chatListeners: Array<Listener<{ requestId: string; chunk: string }>> = [];
  const agentListeners: Array<Listener<{ requestId: string; event: AgentEvent }>> = [];
  const approvalListeners: Array<Listener<ApprovalRequest>> = [];
  const commandListeners: Array<Listener<{ requestId: string; chunk: string }>> = [];
  const devListeners: Array<Listener<{ chunk: string }>> = [];
  let branch = 'main';
  let gitFiles = [
    { path: 'src/App.tsx', index: ' ', workingDir: 'M', state: 'modified' },
    { path: 'src/components/Hero.tsx', index: '?', workingDir: '?', state: 'untracked' }
  ];

  const emitAgent = (requestId: string, event: AgentEvent) => agentListeners.forEach(listener => listener({ requestId, event }));
  const emitChunk = (requestId: string, chunk: string) => chatListeners.forEach(listener => listener({ requestId, chunk }));
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const pendingApprovals = new Map<string, (approved: boolean) => void>();
  const requestApproval = (id: string, request: Omit<ApprovalRequest, 'id'>) =>
    new Promise<boolean>(resolve => {
      pendingApprovals.set(id, approved => {
        pendingApprovals.delete(id);
        resolve(approved);
      });
      approvalListeners.forEach(listener => listener({ id, ...request }));
    });

  const listFiles = (): TreeEntry[] => {
    const entries = new Map<string, TreeEntry>();
    for (const file of Object.keys(files)) {
      const parts = file.split('/');
      for (let index = 0; index < parts.length; index++) {
        const path = parts.slice(0, index + 1).join('/');
        if (!entries.has(path)) {
          entries.set(path, {
            name: parts[index],
            path,
            type: index === parts.length - 1 ? 'file' : 'directory'
          });
        }
      }
    }
    return [...entries.values()].sort(compareTreeEntries);
  };

  const updateSettings = async (patch: Record<string, unknown>): Promise<PublicSettings> => {
    const next = { ...settings };
    if (Array.isArray(patch.clearSecrets)) {
      for (const secret of patch.clearSecrets) {
        if (secret === 'geminiKey') {
          next.hasGeminiKey = false;
          next.geminiKeyHint = null;
        }
        if (secret === 'openrouterKey') {
          next.hasOpenRouterKey = false;
          next.openrouterKeyHint = null;
        }
        if (secret === 'githubToken') {
          next.hasGithubToken = false;
          next.githubTokenHint = null;
          next.githubLogin = null;
        }
      }
    }
    if (typeof patch.geminiKey === 'string' && patch.geminiKey.trim()) {
      next.hasGeminiKey = true;
      next.geminiKeyHint = '••••' + patch.geminiKey.trim().slice(-4);
    }
    if (typeof patch.openrouterKey === 'string' && patch.openrouterKey.trim()) {
      next.hasOpenRouterKey = true;
      next.openrouterKeyHint = '••••' + patch.openrouterKey.trim().slice(-4);
    }
    if (typeof patch.githubToken === 'string' && patch.githubToken.trim()) {
      next.hasGithubToken = true;
      next.githubTokenHint = '••••' + patch.githubToken.trim().slice(-4);
    }
    settings = {
      ...next,
      ...(patch as Partial<PublicSettings>),
      hasGeminiKey: next.hasGeminiKey,
      hasOpenRouterKey: next.hasOpenRouterKey,
      hasGithubToken: next.hasGithubToken
    };
    return { ...settings };
  };

  const api: StudioBridge = {
    async appInfo() {
      return { version: '0.2.0-demo', name: 'DARKI Code Studio', platform: 'win32', electron: '33', node: '20' };
    },
    async openExternal() {},
    async showItemInFolder() {},

    async getSettings() {
      return { ...settings };
    },
    updateSettings,
    async clearSecret(secret) {
      return updateSettings({ clearSecrets: [secret] });
    },

    async models(provider) {
      await wait(180);
      return demoModels[provider];
    },
    async testProvider(provider) {
      await wait(500);
      return {
        ok: true,
        provider,
        models: demoModels[provider].length,
        message: `${provider === 'gemini' ? 'Gemini' : 'OpenRouter'} key verified (demo mode).`,
        detail: provider === 'gemini' ? 'Active model: gemini-3.8-flash' : 'Usage: $0.00 of $10.00',
        account: provider === 'openrouter' ? 'DARKI demo' : undefined
      };
    },
    async chat(request) {
      const prompt = request.messages.filter(message => message.role === 'user').pop()?.content || 'Build something';
      const lower = prompt.toLowerCase();
      const wantsEdit = /apply|edit|fix|change|update|write|implement|add\b/.test(lower);
      emitAgent(request.requestId, { type: 'step', step: 1, maxSteps: 20 });
      await wait(280);
      emitAgent(request.requestId, { type: 'tool_start', id: 'demo-1', name: 'list_files', label: 'Listing project files' });
      await wait(420);
      emitAgent(request.requestId, {
        type: 'tool_end',
        id: 'demo-1',
        name: 'list_files',
        status: 'ok',
        summary: (Object.keys(files).length || 8) + ' project files',
        durationMs: 420
      });
      emitAgent(request.requestId, { type: 'tool_start', id: 'demo-2', name: 'read_file', label: 'Reading file', detail: 'src/App.tsx' });
      await wait(340);
      emitAgent(request.requestId, { type: 'tool_end', id: 'demo-2', name: 'read_file', status: 'ok', summary: 'Read src/App.tsx', durationMs: 340 });

      let changedNote = 'none (demo preview)';
      if (wantsEdit) {
        const before = files['src/App.tsx'];
        const after = before.replace('<Hero />', '<Hero headline="Calm products for noisy worlds." />');
        if (before === after) {
          changedNote = 'src/App.tsx already contains the target change';
        } else if (settings.approvalMode === 'edits') {
          files['src/App.tsx'] = after;
          changedNote = 'src/App.tsx updated automatically (auto-edit mode)';
        } else if (settings.approvalMode === 'readonly') {
          changedNote = 'blocked — read-only mode prevents writes';
        } else {
          emitAgent(request.requestId, { type: 'tool_start', id: 'demo-3', name: 'write_file', label: 'Proposed edit', detail: 'src/App.tsx' });
          const approved = await requestApproval('demo-3', {
            title: 'Edit src/App.tsx',
            detail: 'Replace <Hero /> with <Hero headline="Calm products for noisy worlds." />',
            kind: 'write',
            path: 'src/App.tsx',
            before,
            after
          });
          emitAgent(request.requestId, {
            type: 'tool_end',
            id: 'demo-3',
            name: 'write_file',
            status: approved ? 'ok' : 'denied',
            summary: approved ? '1 line changed in src/App.tsx' : 'Edit denied by user',
            durationMs: 180
          });
          if (approved) {
            files['src/App.tsx'] = after;
            changedNote = 'src/App.tsx updated in the demo store';
          } else {
            changedNote = 'none — the edit was denied';
          }
        }
      }

      const response = `I inspected the project and ${lower.includes('audit') ? 'found one small issue to tighten up' : wantsEdit ? 'prepared a focused change' : 'I am ready to make that change'}.

### What I found
- \`src/App.tsx\` composes the page from \`Hero\` and \`ProjectGrid\`.
- The visual system lives in \`src/styles.css\` and uses a cyan accent on a near-black canvas.
- There is no test script, so I would verify with a production build.

### Proposed change
Replace \`<Hero />\` with \`<Hero headline="Calm products for noisy worlds." />\` in \`src/App.tsx\`.

${wantsEdit ? `**Changed:** ${changedNote}\n**Next:** refresh the workspace or ask for another edit.` : `**Changed:** none (demo preview)\n**Next:** ask me to apply a focused edit.`}

\`\`\`tsx
// Example: keep the page composition clear
export default function App() {
  return (
    <main className="shell">
      <Hero />
      <ProjectGrid />
    </main>
  );
}
\`\`\``;
      for (let index = 0; index < response.length; index += 18) {
        emitChunk(request.requestId, response.slice(index, index + 18));
        await wait(12);
      }
      emitAgent(request.requestId, { type: 'step', step: wantsEdit ? 3 : 2, maxSteps: 20 });
      return {
        content: response,
        steps: wantsEdit ? 3 : 2,
        cancelled: false,
        usage: { promptTokens: 1840, completionTokens: 420, totalTokens: 2260 }
      };
    },
    async cancelChat() {
      return true;
    },
    onChatChunk(callback) {
      chatListeners.push(callback);
      return () => {
        const index = chatListeners.indexOf(callback);
        if (index >= 0) chatListeners.splice(index, 1);
      };
    },
    onAgentEvent(callback) {
      agentListeners.push(callback);
      return () => {
        const index = agentListeners.indexOf(callback);
        if (index >= 0) agentListeners.splice(index, 1);
      };
    },

    async respondApproval(id, approved) {
      pendingApprovals.get(id)?.(approved);
      return true;
    },
    onApproval(callback) {
      approvalListeners.push(callback);
      return () => {
        const index = approvalListeners.indexOf(callback);
        if (index >= 0) approvalListeners.splice(index, 1);
      };
    },

    async openFolder() {
      return ROOT;
    },
    async openRecent(root) {
      return root;
    },
    async validateProject() {
      return true;
    },
    async chooseProjectParent() {
      return 'C:\\Users\\you\\Projects';
    },
    async createProject() {
      return ROOT;
    },
    async cloneProject() {
      return ROOT;
    },

    async listFiles() {
      await wait(80);
      return listFiles();
    },
    async readFile(_root, relativePath) {
      await wait(40);
      if (!(relativePath in files)) throw new Error('File not found: ' + relativePath);
      return files[relativePath];
    },
    async writeFile(_root, relativePath, content) {
      files[relativePath] = content;
    },
    async createItem(_root, relativePath, type, content, overwrite) {
      const exists = relativePath in files || Object.keys(files).some(key => key.startsWith(relativePath + '/'));
      if (exists && !overwrite) throw new Error('A file already exists at ' + relativePath + '.');
      if (type === 'directory') {
        files[relativePath + '/.gitkeep'] = '';
      } else {
        files[relativePath] = content || '';
      }
    },
    async deleteItem(_root, relativePath) {
      delete files[relativePath];
    },
    async renameItem(_root, from, to) {
      files[to] = files[from] || '';
      delete files[from];
    },
    async searchFiles(_root, query): Promise<SearchMatch[]> {
      const matches: SearchMatch[] = [];
      for (const [file, content] of Object.entries(files)) {
        content.split('\n').forEach((line, index) => {
          const column = line.toLowerCase().indexOf(query.toLowerCase());
          if (column >= 0 && matches.length < 100) {
            matches.push({ path: file, line: index + 1, column: column + 1, preview: line.trim().slice(0, 200) });
          }
        });
      }
      return matches;
    },
    async undoLast() {
      return 'Undid the last AI edit.';
    },

    async gitSummary() {
      return {
        isRepo: true,
        branch,
        tracking: 'origin/main',
        ahead: 1,
        behind: 0,
        clean: gitFiles.length === 0,
        files: gitFiles,
        remotes: [{ name: 'origin', url: 'https://github.com/you/aurora-studio.git', pushUrl: 'https://github.com/you/aurora-studio.git' }],
        remoteUrl: 'https://github.com/you/aurora-studio.git',
        root: ROOT
      };
    },
    async gitDiff() {
      return `diff --git a/src/App.tsx b/src/App.tsx\nindex 12ab34c..56de78f 100644\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1,12 +1,12 @@\n import { Hero } from './components/Hero';\n import { ProjectGrid } from './components/ProjectGrid';\n \n export default function App() {\n   return (\n     <main className="shell">\n-      <Hero />\n+      <Hero headline="Calm products for noisy worlds." />\n       <ProjectGrid />\n     </main>\n   );\n }`;
    },
    async gitCommit(_root, message) {
      gitFiles = [];
      return { commit: 'a1b2c3d', summary: '2 files changed', branch, message };
    },
    async gitPush() {
      return 'Pushed main to origin.';
    },
    async gitPull() {
      return 'Already up to date.';
    },
    async gitBranches() {
      return { current: branch, local: ['main', 'design-pass'], remote: ['origin/main', 'origin/design-pass'] };
    },
    async gitCheckout(_root, next) {
      branch = next;
      return 'Switched to ' + next;
    },
    async gitCreateBranch(_root, next) {
      branch = next;
      return 'Created ' + next;
    },
    async gitInit() {
      return 'Initialized a Git repository.';
    },

    async githubVerify() {
      // Mirrors electron/github.ts, which persists the verified login via
      // setGithubLogin so the next settings snapshot reports it.
      settings.githubLogin = 'darki-demo';
      return { login: 'darki-demo', name: 'DARKI Demo', avatarUrl: null, htmlUrl: 'https://github.com/darki-demo' };
    },
    async githubRepos(): Promise<GithubRepo[]> {
      return [
        { name: 'aurora-studio', fullName: 'darki-demo/aurora-studio', private: true, htmlUrl: '#', cloneUrl: '', updatedAt: new Date().toISOString(), defaultBranch: 'main' },
        { name: 'northwind-app', fullName: 'darki-demo/northwind-app', private: false, htmlUrl: '#', cloneUrl: '', updatedAt: new Date().toISOString(), defaultBranch: 'main' }
      ];
    },
    async githubCreate(input) {
      return {
        repoUrl: 'https://github.com/darki-demo/' + input.name,
        published: true,
        message: 'Repository created and project published.',
        detail: 'Committed local changes and pushed.'
      };
    },
    async githubPullRequest(input) {
      return `https://github.com/${input.owner}/${input.repo}/pull/1`;
    },
    async githubPullRequests() {
      return [{ number: 1, title: 'Polish landing page spacing', state: 'open', html_url: '#', user: { login: 'darki-demo' } }];
    },

    async startStaticPreview() {
      return blobPreview;
    },
    async stopStaticPreview() {},
    async previewStatus() {
      return { url: blobPreview, root: ROOT };
    },
    async startDevServer() {
      await wait(700);
      return { url: blobPreview, command: 'npm run dev' };
    },
    async stopDevServer() {
      return true;
    },
    async devStatus() {
      return { running: false, root: null, url: null, command: null, logs: [] };
    },
    onDevOutput(callback) {
      devListeners.push(callback);
      return () => {
        const index = devListeners.indexOf(callback);
        if (index >= 0) devListeners.splice(index, 1);
      };
    },

    async runCommand(_root, command, requestId) {
      emitAgent(requestId, { type: 'notice', message: 'Demo command: ' + command });
      const output = `> demo@0.1.0 ${command}\n\n  VITE v6.0.5  ready in 312 ms\n\n  ➜  Local:   http://127.0.0.1:5173/\n`;
      for (const char of output) {
        commandListeners.forEach(listener => listener({ requestId, chunk: char }));
        await wait(4);
      }
      return { code: 0, output, timedOut: false };
    },
    async stopCommand() {
      return true;
    },
    onCommandOutput(callback) {
      commandListeners.push(callback);
      return () => {
        const index = commandListeners.indexOf(callback);
        if (index >= 0) commandListeners.splice(index, 1);
      };
    }
  };

  (window as unknown as { studio: StudioBridge }).studio = api;
}
