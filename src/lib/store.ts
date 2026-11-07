import { create } from 'zustand';
import type {
  ApprovalRequest,
  ChatRequest,
  GitSummary,
  ModelInfo,
  PublicSettings,
  SearchMatch,
  SettingsSection,
  TreeEntry,
  Usage
} from './types';

export type AgentStep = {
  id: string;
  name: string;
  label: string;
  detail?: string;
  status: 'running' | 'ok' | 'error' | 'denied';
  summary?: string;
  startedAt: number;
  durationMs?: number;
};

export type ChatItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  steps?: AgentStep[];
  error?: boolean;
  stopped?: boolean;
  model?: string;
  usage?: Usage;
  stepInfo?: { step: number; maxSteps: number };
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatItem[];
};

export type EditorTab = {
  path: string;
  content: string;
  savedContent: string;
};

export type ToastKind = 'info' | 'success' | 'error' | 'warning';
export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
};

export type LogKind = 'info' | 'success' | 'error' | 'warning' | 'agent' | 'git';
export type LogEntry = { id: string; at: number; kind: LogKind; message: string };
export type TerminalLine = { id: string; kind: 'input' | 'output' | 'error' | 'info' | 'success'; text: string };

export type SidebarView = 'explorer' | 'search' | 'git' | 'github';
export type RightTab = 'chat' | 'preview';
export type BottomTab = 'terminal' | 'activity';

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
};

export type PromptRequest = {
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
};

const uid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

export const newChat = (): ChatSession => ({
  id: uid(),
  title: 'New chat',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: []
});

type StudioState = {
  root: string | null;
  files: TreeEntry[];
  tabs: EditorTab[];
  activePath: string | null;
  filesLoading: boolean;

  settings: PublicSettings | null;
  models: ModelInfo[];
  modelsLoading: boolean;
  modelsError: string | null;
  git: GitSummary | null;
  gitLoading: boolean;

  chats: ChatSession[];
  activeChatId: string | null;
  busy: boolean;
  stopping: boolean;
  stream: { requestId: string; chatId: string; messageId: string } | null;
  currentStep: string | null;
  activeRequest: ChatRequest | null;
  usage: Usage | null;

  approvals: ApprovalRequest[];
  toasts: Toast[];
  logs: LogEntry[];
  terminal: TerminalLine[];
  terminalRunning: string | null;
  searchResults: SearchMatch[];
  searchLoading: boolean;
  searchError: string | null;
  reveal: { path: string; line: number; column: number; nonce: number } | null;
  previewNonce: number;
  editorCursor: { line: number; column: number };

  activeView: SidebarView;
  rightTab: RightTab;
  bottomTab: BottomTab;
  sidebarOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  paletteOpen: boolean;
  newProjectOpen: boolean;

  confirmRequest: ConfirmRequest | null;
  promptRequest: PromptRequest | null;

  patch: (partial: Partial<StudioState>) => void;
  setRoot: (root: string | null) => void;
  setFiles: (files: TreeEntry[]) => void;
  openTab: (path: string, content: string) => void;
  closeTab: (path: string) => void;
  activateTab: (path: string) => void;
  updateTab: (path: string, content: string) => void;
  markTabSaved: (path: string, content: string) => void;
  updateTabPath: (from: string, to: string) => void;

  setSettings: (settings: PublicSettings) => void;
  setChats: (chats: ChatSession[]) => void;
  setActiveChatId: (id: string) => void;
  createChat: () => string;
  removeChat: (id: string) => void;
  appendMessage: (chatId: string, message: ChatItem) => void;
  updateMessage: (chatId: string, messageId: string, updater: (message: ChatItem) => ChatItem) => void;
  setChatTitle: (chatId: string, title: string) => void;

  setStream: (stream: StudioState['stream']) => void;
  enqueueApproval: (request: ApprovalRequest) => void;
  removeApproval: (id: string) => void;

  showToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  log: (message: string, kind?: LogKind) => void;
  clearLogs: () => void;
  appendTerminal: (text: string, kind?: TerminalLine['kind']) => void;
  clearTerminal: () => void;
  askConfirm: (options: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
  askPrompt: (options: Omit<PromptRequest, 'resolve'>) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;
  bumpPreview: () => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  root: null,
  files: [],
  tabs: [],
  activePath: null,
  filesLoading: false,

  settings: null,
  models: [],
  modelsLoading: false,
  modelsError: null,
  git: null,
  gitLoading: false,

  chats: [],
  activeChatId: null,
  busy: false,
  stopping: false,
  stream: null,
  currentStep: null,
  activeRequest: null,
  usage: null,

  approvals: [],
  toasts: [],
  logs: [],
  terminal: [],
  terminalRunning: null,
  searchResults: [],
  searchLoading: false,
  searchError: null,
  reveal: null,
  previewNonce: 0,
  editorCursor: { line: 1, column: 1 },

  activeView: 'explorer',
  rightTab: 'chat',
  bottomTab: 'terminal',
  sidebarOpen: true,
  rightOpen: true,
  bottomOpen: false,
  settingsOpen: false,
  settingsSection: 'providers',
  paletteOpen: false,
  newProjectOpen: false,

  confirmRequest: null,
  promptRequest: null,

  patch: partial => set(partial),
  setRoot: root =>
    set({
      root,
      tabs: [],
      activePath: null,
      files: [],
      git: null,
      chats: [],
      activeChatId: null,
      usage: null,
      searchResults: [],
      reveal: null
    }),
  setFiles: files => set({ files }),
  openTab: (path, content) =>
    set(state => {
      const existing = state.tabs.find(tab => tab.path === path);
      if (existing) return { activePath: path };
      return {
        tabs: [...state.tabs, { path, content, savedContent: content }],
        activePath: path
      };
    }),
  closeTab: path =>
    set(state => {
      const index = state.tabs.findIndex(tab => tab.path === path);
      const tabs = state.tabs.filter(tab => tab.path !== path);
      let activePath = state.activePath;
      if (state.activePath === path) activePath = tabs[Math.max(0, index - 1)]?.path || tabs[0]?.path || null;
      return { tabs, activePath };
    }),
  activateTab: path => set({ activePath: path }),
  updateTab: (path, content) =>
    set(state => ({
      tabs: state.tabs.map(tab => (tab.path === path ? { ...tab, content } : tab))
    })),
  markTabSaved: (path, content) =>
    set(state => ({
      tabs: state.tabs.map(tab =>
        tab.path === path ? { ...tab, content, savedContent: content } : tab
      )
    })),
  updateTabPath: (from, to) =>
    set(state => ({
      tabs: state.tabs.map(tab =>
        tab.path === from
          ? { ...tab, path: to }
          : { ...tab }
      ),
      activePath: state.activePath === from ? to : state.activePath
    })),

  setSettings: settings => set({ settings }),
  setChats: chats => set({ chats }),
  setActiveChatId: activeChatId => set({ activeChatId }),
  createChat: () => {
    const chat = newChat();
    set(state => ({ chats: [chat, ...state.chats], activeChatId: chat.id }));
    return chat.id;
  },
  removeChat: id =>
    set(state => {
      const chats = state.chats.filter(chat => chat.id !== id);
      let activeChatId = state.activeChatId;
      if (activeChatId === id) activeChatId = chats[0]?.id || null;
      if (!chats.length) {
        const chat = newChat();
        return { chats: [chat], activeChatId: chat.id };
      }
      return { chats, activeChatId };
    }),
  appendMessage: (chatId, message) =>
    set(state => ({
      chats: state.chats.map(chat =>
        chat.id === chatId
          ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, message] }
          : chat
      )
    })),
  updateMessage: (chatId, messageId, updater) =>
    set(state => ({
      chats: state.chats.map(chat =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map(message => (message.id === messageId ? updater(message) : message))
            }
          : chat
      )
    })),
  setChatTitle: (chatId, title) =>
    set(state => ({
      chats: state.chats.map(chat => (chat.id === chatId ? { ...chat, title } : chat))
    })),

  setStream: stream => set({ stream }),
  enqueueApproval: request => set(state => ({ approvals: [...state.approvals, request] })),
  removeApproval: id => set(state => ({ approvals: state.approvals.filter(item => item.id !== id) })),

  showToast: toast => {
    const id = uid();
    set(state => ({ toasts: [...state.toasts, { id, ...toast }] }));
    return id;
  },
  dismissToast: id => set(state => ({ toasts: state.toasts.filter(item => item.id !== id) })),
  log: (message, kind = 'info') =>
    set(state => ({
      logs: [...state.logs.slice(-299), { id: uid(), at: Date.now(), kind, message }]
    })),
  clearLogs: () => set({ logs: [] }),
  appendTerminal: (text, kind = 'output') =>
    set(state => ({
      terminal: [...state.terminal.slice(-1200), { id: uid(), kind, text }]
    })),
  clearTerminal: () => set({ terminal: [] }),

  askConfirm: options =>
    new Promise<boolean>(resolve => {
      set({ confirmRequest: { ...options, resolve } });
    }),
  resolveConfirm: value => {
    const request = get().confirmRequest;
    set({ confirmRequest: null });
    request?.resolve(value);
  },
  askPrompt: options =>
    new Promise<string | null>(resolve => {
      set({ promptRequest: { ...options, resolve } });
    }),
  resolvePrompt: value => {
    const request = get().promptRequest;
    set({ promptRequest: null });
    request?.resolve(value);
  },
  bumpPreview: () => set(state => ({ previewNonce: state.previewNonce + 1 }))
}));

export const getStudio = () => useStudio.getState();
