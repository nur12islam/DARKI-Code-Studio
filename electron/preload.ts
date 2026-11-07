import { contextBridge, ipcRenderer } from 'electron';

export type TreeEntry = { name: string; path: string; type: 'file' | 'directory' };
export type SearchMatch = { path: string; line: number; column: number; preview: string };
export type Provider = 'gemini' | 'openrouter';
export type ModelInfo = {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  isFree?: boolean;
  supportsTools?: boolean;
  recommended?: boolean;
  inputPrice?: number;
  outputPrice?: number;
};
export type PublicSettings = {
  modelProvider: Provider;
  geminiModel: string;
  openrouterModel: string;
  approvalMode: 'ask' | 'edits' | 'readonly';
  autoFallback: boolean;
  fallbackModels: string;
  editorFontSize: number;
  editorWordWrap: boolean;
  temperature: number;
  recentProjects: string[];
  lastProjectRoot: string | null;
  githubLogin: string | null;
  hasGeminiKey: boolean;
  geminiKeyHint: string | null;
  hasOpenRouterKey: boolean;
  openrouterKeyHint: string | null;
  hasGithubToken: boolean;
  githubTokenHint: string | null;
  encryptionAvailable: boolean;
  settingsPath: string;
};
export type ProviderTestResult = {
  ok: boolean;
  provider: Provider;
  message: string;
  detail?: string;
  models?: number;
  account?: string;
  credits?: { usage?: number; limit?: number | null; remaining?: number | null; label?: string };
};
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatRequest = {
  root: string;
  requestId: string;
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  autoFallback?: boolean;
  fallbackModels?: string[];
};
export type Usage = { promptTokens?: number; completionTokens?: number; totalTokens?: number; cost?: number };
export type AgentEvent =
  | { type: 'step'; step: number; maxSteps: number }
  | { type: 'tool_start'; id: string; name: string; label: string; detail?: string }
  | { type: 'tool_end'; id: string; name: string; status: 'ok' | 'error' | 'denied'; summary: string; durationMs: number }
  | { type: 'usage'; usage: Usage }
  | { type: 'notice'; message: string };
export type ChatResponse = { content: string; usage?: Usage; steps: number; cancelled: boolean };
export type ApprovalRequest = {
  id: string;
  title: string;
  detail: string;
  kind: 'write' | 'delete' | 'command' | 'git' | 'network';
  path?: string;
  before?: string | null;
  after?: string | null;
  meta?: string;
};
export type GitChange = { path: string; index: string; workingDir: string; state: string };
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
export type GithubUser = { login: string; name: string | null; avatarUrl: string | null; htmlUrl: string | null };
export type GithubRepo = {
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  updatedAt: string | null;
  defaultBranch: string;
};
export type PublishResult = { repoUrl: string; published: boolean; message: string; detail?: string };
export type DevServerStatus = {
  running: boolean;
  root: string | null;
  url: string | null;
  command: string | null;
  logs: string[];
};

function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  appInfo: () => ipcRenderer.invoke('app:info') as Promise<{
    version: string;
    name: string;
    platform: string;
    electron: string;
    node: string;
  }>,
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url) as Promise<void>,
  showItemInFolder: (target: string) => ipcRenderer.invoke('app:showItemInFolder', target) as Promise<void>,

  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<PublicSettings>,
  updateSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:update', patch) as Promise<PublicSettings>,
  clearSecret: (secret: 'geminiKey' | 'openrouterKey' | 'githubToken') =>
    ipcRenderer.invoke('settings:clearSecret', secret) as Promise<PublicSettings>,

  models: (provider: Provider) => ipcRenderer.invoke('provider:models', provider) as Promise<ModelInfo[]>,
  testProvider: (provider: Provider) =>
    ipcRenderer.invoke('provider:test', provider) as Promise<ProviderTestResult>,
  chat: (request: ChatRequest) => ipcRenderer.invoke('provider:chat', request) as Promise<ChatResponse>,
  cancelChat: (requestId: string) => ipcRenderer.invoke('provider:cancel', requestId) as Promise<boolean>,
  onChatChunk: (callback: (payload: { requestId: string; chunk: string }) => void) =>
    subscribe('chat:chunk', callback),
  onAgentEvent: (callback: (payload: { requestId: string; event: AgentEvent }) => void) =>
    subscribe('agent:event', callback),

  respondApproval: (id: string, approved: boolean) =>
    ipcRenderer.invoke('approval:respond', id, approved) as Promise<boolean>,
  onApproval: (callback: (request: ApprovalRequest) => void) => subscribe('approval:request', callback),

  openFolder: () => ipcRenderer.invoke('project:open') as Promise<string | null>,
  openRecent: (root: string) => ipcRenderer.invoke('project:openRecent', root) as Promise<string>,
  validateProject: (root: string) => ipcRenderer.invoke('project:validate', root) as Promise<boolean>,
  chooseProjectParent: () => ipcRenderer.invoke('project:parent') as Promise<string | null>,
  createProject: (parent: string, name: string, template: 'react' | 'static' | 'node' | 'blank' = 'react') =>
    ipcRenderer.invoke('project:create', parent, name, template) as Promise<string>,
  cloneProject: (url: string) => ipcRenderer.invoke('project:clone', url) as Promise<string | null>,

  listFiles: (root: string) => ipcRenderer.invoke('fs:list', root) as Promise<TreeEntry[]>,
  readFile: (root: string, relativePath: string) =>
    ipcRenderer.invoke('fs:read', root, relativePath) as Promise<string>,
  writeFile: (root: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('fs:write', root, relativePath, content) as Promise<void>,
  createItem: (
    root: string,
    relativePath: string,
    type: 'file' | 'directory',
    content?: string,
    overwrite = false
  ) => ipcRenderer.invoke('fs:create', root, relativePath, type, content, overwrite) as Promise<void>,
  deleteItem: (root: string, relativePath: string) =>
    ipcRenderer.invoke('fs:delete', root, relativePath) as Promise<void>,
  renameItem: (root: string, from: string, to: string) =>
    ipcRenderer.invoke('fs:rename', root, from, to) as Promise<void>,
  searchFiles: (root: string, query: string, limit = 100) =>
    ipcRenderer.invoke('fs:search', root, query, limit) as Promise<SearchMatch[]>,
  undoLast: (root: string) => ipcRenderer.invoke('undo:last', root) as Promise<string>,

  gitSummary: (root: string) => ipcRenderer.invoke('git:summary', root) as Promise<GitSummary>,
  gitDiff: (root: string, file?: string) => ipcRenderer.invoke('git:diff', root, file) as Promise<string>,
  gitCommit: (root: string, message: string) =>
    ipcRenderer.invoke('git:commit', root, message) as Promise<{
      commit: string;
      summary: string;
      branch: string;
      message: string;
    }>,
  gitPush: (root: string) => ipcRenderer.invoke('git:push', root) as Promise<string>,
  gitPull: (root: string) => ipcRenderer.invoke('git:pull', root) as Promise<string>,
  gitBranches: (root: string) =>
    ipcRenderer.invoke('git:branches', root) as Promise<{ current: string; local: string[]; remote: string[] }>,
  gitCheckout: (root: string, branch: string) =>
    ipcRenderer.invoke('git:checkout', root, branch) as Promise<string>,
  gitCreateBranch: (root: string, branch: string) =>
    ipcRenderer.invoke('git:createBranch', root, branch) as Promise<string>,
  gitInit: (root: string) => ipcRenderer.invoke('git:init', root) as Promise<string>,

  githubVerify: () => ipcRenderer.invoke('github:verify') as Promise<GithubUser>,
  githubRepos: () => ipcRenderer.invoke('github:repos') as Promise<GithubRepo[]>,
  githubCreate: (input: { root?: string | null; name: string; description?: string; private?: boolean }) =>
    ipcRenderer.invoke('github:create', input) as Promise<PublishResult>,
  githubPullRequest: (input: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }) => ipcRenderer.invoke('github:pr', input) as Promise<string>,
  githubPullRequests: (owner: string, repo: string) =>
    ipcRenderer.invoke('github:prs', owner, repo) as Promise<
      Array<{ number: number; title: string; state: string; html_url: string; user?: { login?: string } }>
    >,

  startStaticPreview: (root: string) => ipcRenderer.invoke('preview:startStatic', root) as Promise<string>,
  stopStaticPreview: () => ipcRenderer.invoke('preview:stopStatic') as Promise<void>,
  previewStatus: () => ipcRenderer.invoke('preview:status') as Promise<{ url: string | null; root: string | null }>,
  startDevServer: (root: string) =>
    ipcRenderer.invoke('dev:start', root) as Promise<{ url: string; command: string }>,
  stopDevServer: () => ipcRenderer.invoke('dev:stop') as Promise<boolean>,
  devStatus: () => ipcRenderer.invoke('dev:status') as Promise<DevServerStatus>,
  onDevOutput: (callback: (payload: { chunk: string }) => void) => subscribe('dev:output', callback),

  runCommand: (root: string, command: string, requestId: string) =>
    ipcRenderer.invoke('command:run', root, command, requestId) as Promise<{
      code: number | null;
      output: string;
      timedOut: boolean;
    }>,
  stopCommand: (requestId: string) => ipcRenderer.invoke('command:stop', requestId) as Promise<boolean>,
  onCommandOutput: (callback: (payload: { requestId: string; chunk: string }) => void) =>
    subscribe('command:output', callback)
};

export type StudioBridge = typeof api;
contextBridge.exposeInMainWorld('studio', api);
