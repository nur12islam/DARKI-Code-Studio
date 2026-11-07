export type TreeEntry = { name: string; path: string; type: 'file' | 'directory' };
export type SearchMatch = { path: string; line: number; column: number; preview: string };
export type Provider = 'gemini' | 'openrouter';
export type SettingsSection = 'providers' | 'agent' | 'editor' | 'github' | 'about';
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
export type ChatMessagePayload = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatRequest = {
  root: string;
  requestId: string;
  provider: Provider;
  model: string;
  messages: ChatMessagePayload[];
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
export type AppInfo = {
  version: string;
  name: string;
  platform: string;
  electron: string;
  node: string;
};

export type StudioBridge = {
  appInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
  showItemInFolder(target: string): Promise<void>;

  getSettings(): Promise<PublicSettings>;
  updateSettings(patch: Record<string, unknown>): Promise<PublicSettings>;
  clearSecret(secret: 'geminiKey' | 'openrouterKey' | 'githubToken'): Promise<PublicSettings>;

  models(provider: Provider): Promise<ModelInfo[]>;
  testProvider(provider: Provider): Promise<ProviderTestResult>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  cancelChat(requestId: string): Promise<boolean>;
  onChatChunk(callback: (payload: { requestId: string; chunk: string }) => void): () => void;
  onAgentEvent(callback: (payload: { requestId: string; event: AgentEvent }) => void): () => void;

  respondApproval(id: string, approved: boolean): Promise<boolean>;
  onApproval(callback: (request: ApprovalRequest) => void): () => void;

  openFolder(): Promise<string | null>;
  openRecent(root: string): Promise<string>;
  validateProject(root: string): Promise<boolean>;
  chooseProjectParent(): Promise<string | null>;
  createProject(parent: string, name: string, template?: 'react' | 'static' | 'node' | 'blank'): Promise<string>;
  cloneProject(url: string): Promise<string | null>;

  listFiles(root: string): Promise<TreeEntry[]>;
  readFile(root: string, relativePath: string): Promise<string>;
  writeFile(root: string, relativePath: string, content: string): Promise<void>;
  createItem(
    root: string,
    relativePath: string,
    type: 'file' | 'directory',
    content?: string,
    overwrite?: boolean
  ): Promise<void>;
  deleteItem(root: string, relativePath: string): Promise<void>;
  renameItem(root: string, from: string, to: string): Promise<void>;
  searchFiles(root: string, query: string, limit?: number): Promise<SearchMatch[]>;
  undoLast(root: string): Promise<string>;

  gitSummary(root: string): Promise<GitSummary>;
  gitDiff(root: string, file?: string): Promise<string>;
  gitCommit(
    root: string,
    message: string
  ): Promise<{ commit: string; summary: string; branch: string; message: string }>;
  gitPush(root: string): Promise<string>;
  gitPull(root: string): Promise<string>;
  gitBranches(root: string): Promise<{ current: string; local: string[]; remote: string[] }>;
  gitCheckout(root: string, branch: string): Promise<string>;
  gitCreateBranch(root: string, branch: string): Promise<string>;
  gitInit(root: string): Promise<string>;

  githubVerify(): Promise<GithubUser>;
  githubRepos(): Promise<GithubRepo[]>;
  githubCreate(input: {
    root?: string | null;
    name: string;
    description?: string;
    private?: boolean;
  }): Promise<PublishResult>;
  githubPullRequest(input: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }): Promise<string>;
  githubPullRequests(
    owner: string,
    repo: string
  ): Promise<Array<{ number: number; title: string; state: string; html_url: string; user?: { login?: string } }>>;

  startStaticPreview(root: string): Promise<string>;
  stopStaticPreview(): Promise<void>;
  previewStatus(): Promise<{ url: string | null; root: string | null }>;
  startDevServer(root: string): Promise<{ url: string; command: string }>;
  stopDevServer(): Promise<boolean>;
  devStatus(): Promise<DevServerStatus>;
  onDevOutput(callback: (payload: { chunk: string }) => void): () => void;

  runCommand(
    root: string,
    command: string,
    requestId: string
  ): Promise<{ code: number | null; output: string; timedOut: boolean }>;
  stopCommand(requestId: string): Promise<boolean>;
  onCommandOutput(callback: (payload: { requestId: string; chunk: string }) => void): () => void;
};
