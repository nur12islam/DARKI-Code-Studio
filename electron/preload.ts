import { contextBridge, ipcRenderer } from 'electron';

export type TreeEntry = { name: string; path: string; type: 'file' | 'directory' };
export type ChatRequest = { apiKey: string; model: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; temperature?: number };

const api = {
  openFolder: () => ipcRenderer.invoke('project:open') as Promise<string | null>,
  listFiles: (root: string) => ipcRenderer.invoke('fs:list', root) as Promise<TreeEntry[]>,
  readFile: (root: string, relativePath: string) => ipcRenderer.invoke('fs:read', root, relativePath) as Promise<string>,
  writeFile: (root: string, relativePath: string, content: string) => ipcRenderer.invoke('fs:write', root, relativePath, content) as Promise<void>,
  models: () => ipcRenderer.invoke('openrouter:models') as Promise<Array<{ id: string; name: string; context_length?: number }>>,
  chat: (request: ChatRequest) => ipcRenderer.invoke('openrouter:chat', request) as Promise<string>,
  gitStatus: (root: string) => ipcRenderer.invoke('git:status', root) as Promise<{ branch: string; status: string }>,
  push: (root: string) => ipcRenderer.invoke('git:push', root) as Promise<string>,
  previewUrl: (root: string) => ipcRenderer.invoke('preview:url', root) as Promise<string | null>,
  saveSetting: (key: string, value: string) => ipcRenderer.invoke('settings:save', key, value) as Promise<void>,
  readSetting: (key: string) => ipcRenderer.invoke('settings:read', key) as Promise<string | null>,
  runCommand: (root: string, command: string) => ipcRenderer.invoke('command:run', root, command) as Promise<{ code: number | null; output: string }>
};

contextBridge.exposeInMainWorld('studio', api);