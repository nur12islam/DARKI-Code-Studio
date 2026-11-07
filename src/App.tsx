import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleHelp,
  Download,
  FileCode2,
  FileDiff,
  FilePlus,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Github,
  Globe2,
  Loader2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
  Undo2,
  Upload,
  Zap
} from 'lucide-react';
import { ActivityBar } from './components/ActivityBar';
import { ApprovalModal } from './components/ApprovalModal';
import { BottomPanel } from './components/BottomPanel';
import { ChatPanel } from './components/ChatPanel';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette';
import { ConfirmDialog, PromptDialog } from './components/Dialogs';
import { EditorPane } from './components/EditorPane';
import { ExplorerPanel } from './components/ExplorerPanel';
import { GitHubPanel } from './components/GitHubPanel';
import { ApplyCodeModal, DiffModal, NewItemModal, NewProjectModal, type ApplyCodeState, type DiffState, type NewItemState } from './components/Modals';
import { PreviewPanel } from './components/PreviewPanel';
import { SearchPanel } from './components/SearchPanel';
import { SettingsModal } from './components/SettingsModal';
import { SourceControlPanel } from './components/SourceControlPanel';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { loadChats, saveChats } from './lib/chatStorage';
import { useStudio, type AgentStep } from './lib/store';
import type { AppInfo, Provider, SettingsSection } from './lib/types';
import { dirName, isDirty, projectName, sortChats } from './lib/utils';

export default function App() {
  const settings = useStudio(state => state.settings);
  const root = useStudio(state => state.root);
  const activePath = useStudio(state => state.activePath);
  const chats = useStudio(state => state.chats);
  const busy = useStudio(state => state.busy);
  const approvals = useStudio(state => state.approvals);
  const sidebarOpen = useStudio(state => state.sidebarOpen);
  const rightOpen = useStudio(state => state.rightOpen);
  const bottomOpen = useStudio(state => state.bottomOpen);
  const activeView = useStudio(state => state.activeView);
  const rightTab = useStudio(state => state.rightTab);
  const settingsOpen = useStudio(state => state.settingsOpen);
  const settingsSection = useStudio(state => state.settingsSection);
  const paletteOpen = useStudio(state => state.paletteOpen);
  const newProjectOpen = useStudio(state => state.newProjectOpen);
  const patch = useStudio(state => state.patch);
  const setSettings = useStudio(state => state.setSettings);
  const log = useStudio(state => state.log);
  const showToast = useStudio(state => state.showToast);
  const askConfirm = useStudio(state => state.askConfirm);
  const askPrompt = useStudio(state => state.askPrompt);

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [diff, setDiff] = useState<DiffState>(null);
  const [newItem, setNewItem] = useState<NewItemState>(null);
  const [applyCode, setApplyCode] = useState<ApplyCodeState>(null);

  const refreshGit = useCallback(async () => {
    const state = useStudio.getState();
    if (!state.root) {
      state.patch({ git: null, gitLoading: false });
      return;
    }
    state.patch({ gitLoading: true });
    try {
      const summary = await window.studio.gitSummary(state.root);
      useStudio.getState().patch({ git: summary, gitLoading: false });
    } catch (error) {
      useStudio.getState().patch({ git: null, gitLoading: false });
      useStudio.getState().log('Git status unavailable: ' + String(error), 'warning');
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const snapshot = await window.studio.getSettings();
      useStudio.getState().setSettings(snapshot);
      return snapshot;
    } catch (error) {
      useStudio.getState().log('Could not reload settings: ' + String(error), 'error');
      return null;
    }
  }, []);

  const refreshFiles = useCallback(async () => {
    const state = useStudio.getState();
    if (!state.root) return;
    state.patch({ filesLoading: true });
    try {
      const files = await window.studio.listFiles(state.root);
      useStudio.getState().setFiles(files);
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Could not read project files', message: String(error) });
    } finally {
      useStudio.getState().patch({ filesLoading: false });
    }
  }, []);

  const loadModels = useCallback(async (provider: Provider) => {
    const state = useStudio.getState();
    const current = state.settings;
    const connected = provider === 'gemini' ? current?.hasGeminiKey : current?.hasOpenRouterKey;
    if (!connected) {
      state.patch({
        models: [],
        modelsLoading: false,
        modelsError:
          provider === 'gemini'
            ? 'Add a Gemini API key in Settings → Providers to load models.'
            : 'Add an OpenRouter API key in Settings → Providers to load models.'
      });
      return;
    }
    state.patch({ modelsLoading: true, modelsError: null });
    try {
      const list = await window.studio.models(provider);
      useStudio.getState().patch({ models: list, modelsLoading: false, modelsError: null });
    } catch (error) {
      useStudio.getState().patch({
        models: [],
        modelsLoading: false,
        modelsError: error instanceof Error ? error.message : String(error)
      });
    }
  }, []);

  const openWorkspace = useCallback(
    async (nextRoot: string) => {
      const state = useStudio.getState();
      state.setRoot(nextRoot);
      state.patch({
        filesLoading: true,
        gitLoading: true,
        sidebarOpen: true,
        activeView: 'explorer',
        rightOpen: true,
        rightTab: 'chat'
      });

      try {
        const files = await window.studio.listFiles(nextRoot);
        useStudio.getState().setFiles(files);
      } catch (error) {
        useStudio.getState().showToast({
          kind: 'error',
          title: 'Could not read this project',
          message: String(error)
        });
      } finally {
        useStudio.getState().patch({ filesLoading: false });
      }

      const stored = sortChats(loadChats(nextRoot));
      useStudio.getState().patch({ chats: stored, activeChatId: stored[0]?.id || null, usage: null });
      setDiff(null);
      setNewItem(null);
      setApplyCode(null);
      void refreshGit();

      const settingsSnapshot = await refreshSettings();
      if (settingsSnapshot) void loadModels(settingsSnapshot.modelProvider);
    },
    [refreshGit, refreshSettings, loadModels]
  );

  const openFolder = useCallback(async () => {
    try {
      const folder = await window.studio.openFolder();
      if (!folder) return;
      await openWorkspace(folder);
      useStudio.getState().showToast({
        kind: 'success',
        title: 'Project opened',
        message: projectName(folder)
      });
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Could not open project', message: String(error) });
    }
  }, [openWorkspace]);

  const openRecent = useCallback(
    async (recent: string) => {
      try {
        const folder = await window.studio.openRecent(recent);
        await openWorkspace(folder);
      } catch (error) {
        useStudio.getState().showToast({ kind: 'error', title: 'Could not open recent project', message: String(error) });
        void refreshSettings();
      }
    },
    [openWorkspace, refreshSettings]
  );

  const openFile = useCallback(async (path: string) => {
    const state = useStudio.getState();
    if (!state.root) return;
    if (state.tabs.some(tab => tab.path === path)) {
      state.activateTab(path);
      return;
    }
    try {
      const content = await window.studio.readFile(state.root, path);
      useStudio.getState().openTab(path, content);
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Could not open file', message: String(error) });
    }
  }, []);

  const openFileAt = useCallback(
    async (path: string, line: number, column: number) => {
      await openFile(path);
      useStudio.getState().patch({
        reveal: { path, line: Math.max(1, line), column: Math.max(1, column), nonce: Date.now() }
      });
    },
    [openFile]
  );

  const saveFile = useCallback(
    async (path?: string) => {
      const state = useStudio.getState();
      const target = path || state.activePath;
      if (!target || !state.root) return;
      const tab = state.tabs.find(item => item.path === target);
      if (!tab) return;
      try {
        await window.studio.writeFile(state.root, target, tab.content);
        useStudio.getState().markTabSaved(target, tab.content);
        useStudio.getState().log('Saved ' + target, 'success');
        void refreshGit();
      } catch (error) {
        useStudio.getState().showToast({ kind: 'error', title: 'Could not save file', message: String(error) });
      }
    },
    [refreshGit]
  );

  const createItem = useCallback(
    async (path: string, type: 'file' | 'directory') => {
      const state = useStudio.getState();
      if (!state.root) return false;
      const attempt = async (overwrite: boolean) => {
        await window.studio.createItem(state.root!, path, type, undefined, overwrite);
      };
      try {
        try {
          await attempt(false);
        } catch (error) {
          const message = String(error);
          if (/exist/i.test(message)) {
            const ok = await useStudio.getState().askConfirm({
              title: 'Overwrite existing item?',
              message: `“${path}” already exists. Overwrite it with the new ${type}?`,
              confirmLabel: 'Overwrite',
              danger: true
            });
            if (!ok) return false;
            await attempt(true);
          } else {
            throw error;
          }
        }
        await refreshFiles();
        void refreshGit();
        if (type === 'file') await openFile(path);
        useStudio.getState().showToast({
          kind: 'success',
          title: type === 'file' ? 'File created' : 'Folder created',
          message: path
        });
        return true;
      } catch (error) {
        useStudio.getState().showToast({ kind: 'error', title: 'Could not create item', message: String(error) });
        return false;
      }
    },
    [openFile, refreshFiles, refreshGit]
  );

  const renameItem = useCallback(
    async (path: string) => {
      const state = useStudio.getState();
      if (!state.root) return;
      const next = await state.askPrompt({
        title: 'Rename item',
        message: 'Enter the new project-relative path. Folders move their contents.',
        label: 'New path',
        defaultValue: path,
        confirmLabel: 'Rename'
      });
      if (!next || next === path) return;
      try {
        await window.studio.renameItem(state.root, path, next);
        const current = useStudio.getState();
        const tabs = current.tabs.map(tab => {
          if (tab.path === path) return { ...tab, path: next };
          if (tab.path.startsWith(path + '/')) return { ...tab, path: next + tab.path.slice(path.length) };
          return tab;
        });
        let activePathNext = current.activePath;
        if (activePathNext === path) activePathNext = next;
        else if (activePathNext?.startsWith(path + '/')) activePathNext = next + activePathNext.slice(path.length);
        current.patch({ tabs, activePath: activePathNext });
        await refreshFiles();
        void refreshGit();
        useStudio.getState().showToast({ kind: 'success', title: 'Renamed', message: next });
      } catch (error) {
        useStudio.getState().showToast({ kind: 'error', title: 'Could not rename item', message: String(error) });
      }
    },
    [refreshFiles, refreshGit]
  );

  const deleteItem = useCallback(
    async (path: string) => {
      const state = useStudio.getState();
      if (!state.root) return;
      const affected = state.tabs.filter(tab => tab.path === path || tab.path.startsWith(path + '/'));
      const dirty = affected.some(tab => isDirty(tab));
      const ok = await state.askConfirm({
        title: 'Delete from disk?',
        message:
          `“${path}” will be permanently deleted.` +
          (dirty ? ' Open tabs with unsaved changes will be closed.' : ''),
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      try {
        await window.studio.deleteItem(state.root, path);
        const current = useStudio.getState();
        affected.forEach(tab => current.closeTab(tab.path));
        await refreshFiles();
        void refreshGit();
        useStudio.getState().showToast({ kind: 'success', title: 'Deleted', message: path });
      } catch (error) {
        useStudio.getState().showToast({ kind: 'error', title: 'Could not delete item', message: String(error) });
      }
    },
    [refreshFiles, refreshGit]
  );

  const showDiff = useCallback(async (file?: string) => {
    const state = useStudio.getState();
    if (!state.root) return;
    try {
      const text = await window.studio.gitDiff(state.root, file);
      setDiff({
        title: file ? 'Diff · ' + file : 'Working tree diff',
        diff: text,
        note: file ? 'Only this file is shown.' : 'All unstaged and staged changes.'
      });
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Could not load diff', message: String(error) });
    }
  }, []);

  const undoLast = useCallback(async () => {
    const state = useStudio.getState();
    if (!state.root) return;
    try {
      const message = await window.studio.undoLast(state.root);
      useStudio.getState().showToast({ kind: 'success', title: 'AI edit reverted', message });
      await refreshFiles();
      void refreshGit();
      const current = useStudio.getState();
      await Promise.all(
        current.tabs
          .filter(tab => !isDirty(tab))
          .map(async tab => {
            try {
              const content = await window.studio.readFile(state.root!, tab.path);
              useStudio.getState().markTabSaved(tab.path, content);
            } catch {
              // The file may have been removed by the undo.
            }
          })
      );
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Nothing to undo', message: String(error) });
    }
  }, [refreshFiles, refreshGit]);

  const pushChanges = useCallback(async () => {
    const state = useStudio.getState();
    if (!state.root) return;
    try {
      const message = await window.studio.gitPush(state.root);
      useStudio.getState().showToast({ kind: 'success', title: 'Pushed', message });
      void refreshGit();
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Push failed', message: String(error) });
    }
  }, [refreshGit]);

  const cloneRepository = useCallback(async () => {
    const url = await useStudio.getState().askPrompt({
      title: 'Clone a Git repository',
      message: 'Choose a destination folder after entering the repository URL.',
      label: 'Repository URL',
      placeholder: 'https://github.com/owner/repo.git',
      confirmLabel: 'Clone'
    });
    if (!url) return;
    try {
      const folder = await window.studio.cloneProject(url);
      if (!folder) return;
      await openWorkspace(folder);
      useStudio.getState().showToast({ kind: 'success', title: 'Repository cloned', message: folder });
    } catch (error) {
      useStudio.getState().showToast({ kind: 'error', title: 'Clone failed', message: String(error) });
    }
  }, [openWorkspace]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([refreshFiles(), refreshGit(), refreshSettings()]);
  }, [refreshFiles, refreshGit, refreshSettings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [snapshot, info] = await Promise.all([window.studio.getSettings(), window.studio.appInfo()]);
        if (cancelled) return;
        setSettings(snapshot);
        setAppInfo(info);
        if (snapshot.lastProjectRoot) {
          try {
            const valid = await window.studio.validateProject(snapshot.lastProjectRoot);
            if (valid && !cancelled) await openWorkspace(snapshot.lastProjectRoot);
          } catch {
            // Stay on the welcome screen when the previous folder disappeared.
          }
        }
      } catch (error) {
        useStudio.getState().showToast({ kind: 'error', title: 'Startup failed', message: String(error) });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onChunk = window.studio.onChatChunk(({ requestId, chunk }) => {
      const state = useStudio.getState();
      if (!state.stream || state.stream.requestId !== requestId) return;
      state.updateMessage(state.stream.chatId, state.stream.messageId, message => ({
        ...message,
        content: message.content + chunk
      }));
    });

    const onAgentEvent = window.studio.onAgentEvent(({ requestId, event }) => {
      const state = useStudio.getState();
      if (!state.stream || state.stream.requestId !== requestId) return;
      const { chatId, messageId } = state.stream;

      if (event.type === 'step') {
        state.patch({ currentStep: `Step ${event.step} of ${event.maxSteps}` });
        state.updateMessage(chatId, messageId, message => ({
          ...message,
          stepInfo: { step: event.step, maxSteps: event.maxSteps }
        }));
        return;
      }

      if (event.type === 'tool_start') {
        const step: AgentStep = {
          id: event.id,
          name: event.name,
          label: event.label,
          detail: event.detail,
          status: 'running',
          startedAt: Date.now()
        };
        state.updateMessage(chatId, messageId, message => ({
          ...message,
          steps: [...(message.steps || []), step]
        }));
        state.patch({ currentStep: event.label });
        return;
      }

      if (event.type === 'tool_end') {
        state.updateMessage(chatId, messageId, message => ({
          ...message,
          steps: (message.steps || []).map(step =>
            step.id === event.id
              ? {
                  ...step,
                  status: event.status,
                  summary: event.summary,
                  durationMs: event.durationMs
                }
              : step
          )
        }));
        return;
      }

      if (event.type === 'usage') {
        state.patch({ usage: event.usage });
        state.updateMessage(chatId, messageId, message => ({ ...message, usage: event.usage }));
        return;
      }

      if (event.type === 'notice') {
        state.log(event.message, 'agent');
      }
    });

    const onApproval = window.studio.onApproval(request => {
      const state = useStudio.getState();
      state.enqueueApproval(request);
      state.log('Approval requested: ' + request.title, 'warning');
    });

    return () => {
      onChunk();
      onAgentEvent();
      onApproval();
    };
  }, []);

  useEffect(() => {
    if (!root || !chats.length) return;
    const timer = window.setTimeout(() => saveChats(root, chats), 600);
    return () => window.clearTimeout(timer);
  }, [root, chats]);

  useEffect(() => {
    if (!settings) return;
    void loadModels(settings.modelProvider);
  }, [settings?.modelProvider, settings?.hasGeminiKey, settings?.hasOpenRouterKey, loadModels]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      const state = useStudio.getState();
      if (key === 'k' || (event.shiftKey && key === 'p')) {
        event.preventDefault();
        state.patch({ paletteOpen: true });
      } else if (key === 's') {
        event.preventDefault();
        void saveFile(state.activePath || undefined);
      } else if (key === 'b' && !event.shiftKey) {
        event.preventDefault();
        state.patch({ sidebarOpen: !state.sidebarOpen });
      } else if (key === 'j') {
        event.preventDefault();
        state.patch({ bottomOpen: !state.bottomOpen, bottomTab: 'terminal' });
      } else if (event.shiftKey && key === 'f') {
        event.preventDefault();
        state.patch({ activeView: 'search', sidebarOpen: true });
      } else if (event.shiftKey && key === 'g') {
        event.preventDefault();
        state.patch({ activeView: 'git', sidebarOpen: true });
      } else if (event.shiftKey && key === 'e') {
        event.preventDefault();
        state.patch({ activeView: 'explorer', sidebarOpen: true });
      } else if (event.shiftKey && key === 'a') {
        event.preventDefault();
        if (state.rightOpen && state.rightTab === 'chat') state.patch({ rightOpen: false });
        else state.patch({ rightOpen: true, rightTab: 'chat' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveFile]);

  useEffect(() => {
    document.title = root ? `${projectName(root)} · DARKI Code Studio` : 'DARKI Code Studio';
  }, [root]);

  const openSettings = useCallback(
    (section: SettingsSection = 'providers') => {
      patch({ settingsOpen: true, settingsSection: section });
    },
    [patch]
  );
  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: 'open-folder', label: 'Open project folder…', hint: 'Browse to a local directory', group: 'Project', icon: FolderOpen, run: () => void openFolder() },
      { id: 'new-project', label: 'Create a new project…', hint: 'Scaffold a React, static or Node app', group: 'Project', icon: FolderPlus, run: () => patch({ newProjectOpen: true }) },
      { id: 'clone', label: 'Clone a Git repository…', hint: 'Clone into a local folder', group: 'Project', icon: Download, run: () => void cloneRepository() },
      { id: 'save', label: 'Save active file', hint: 'Ctrl+S', group: 'Project', icon: FileCode2, run: () => void saveFile() },
      { id: 'new-file', label: 'New file…', group: 'Project', icon: FilePlus, run: () => setNewItem({ type: 'file', parent: activePath ? dirName(activePath) : '' }) },
      { id: 'new-folder', label: 'New folder…', group: 'Project', icon: FolderPlus, run: () => setNewItem({ type: 'directory', parent: activePath ? dirName(activePath) : '' }) },
      { id: 'refresh', label: 'Refresh workspace', hint: 'Files, Git status and settings', group: 'Workspace', icon: RefreshCw, run: () => void refreshWorkspace() },
      { id: 'search', label: 'Search in project', hint: 'Ctrl+Shift+F', group: 'Workspace', icon: Search, run: () => patch({ activeView: 'search', sidebarOpen: true }) },
      { id: 'scm', label: 'Open source control', hint: 'Ctrl+Shift+G', group: 'Workspace', icon: GitBranch, run: () => patch({ activeView: 'git', sidebarOpen: true }) },
      { id: 'github', label: 'Open GitHub panel', group: 'Workspace', icon: Github, run: () => patch({ activeView: 'github', sidebarOpen: true }) },
      { id: 'terminal', label: 'Toggle terminal', hint: 'Ctrl+J', group: 'Workspace', icon: TerminalSquare, run: () => patch({ bottomOpen: !bottomOpen, bottomTab: 'terminal' }) },
      { id: 'sidebar', label: 'Toggle explorer', hint: 'Ctrl+B', group: 'View', icon: PanelLeft, run: () => patch({ sidebarOpen: !sidebarOpen }) },
      { id: 'assistant', label: 'Toggle the assistant', hint: 'Ctrl+Shift+A', group: 'View', icon: Sparkles, run: () => patch({ rightOpen: !(rightOpen && rightTab === 'chat'), rightTab: 'chat' }) },
      { id: 'preview', label: 'Open preview panel', group: 'View', icon: Globe2, run: () => patch({ rightOpen: true, rightTab: 'preview' }) },
      { id: 'close-bottom', label: 'Toggle bottom panel', hint: 'Ctrl+J', group: 'View', icon: PanelBottom, run: () => patch({ bottomOpen: !bottomOpen }) },
      { id: 'undo', label: 'Undo last AI edit', group: 'Agent', icon: Undo2, run: () => void undoLast() },
      { id: 'settings', label: 'Open settings', hint: 'Providers, keys, approvals', group: 'Agent', icon: Settings, run: () => openSettings() },
      { id: 'models', label: 'Configure models & API keys', group: 'Agent', icon: Zap, run: () => openSettings() },
      { id: 'about', label: 'About DARKI Code Studio', hint: 'Version, security & shortcuts', group: 'Agent', icon: CircleHelp, run: () => openSettings('about') },
      { id: 'diff', label: 'View working tree diff', group: 'Git', icon: FileDiff, run: () => void showDiff() },
      { id: 'push', label: 'Push committed changes', group: 'Git', icon: Upload, run: () => void pushChanges() }
    ],
    [
      activePath,
      bottomOpen,
      cloneRepository,
      openFolder,
      openSettings,
      patch,
      pushChanges,
      refreshWorkspace,
      rightOpen,
      rightTab,
      saveFile,
      showDiff,
      sidebarOpen,
      undoLast
    ]
  );

  if (!hydrated) {
    return (
      <div className="boot-screen">
        <div className="boot-glow" />
        <div className="brand-mark xl">
          <Zap size={26} />
        </div>
        <strong>
          DARKI<span> CODE</span>
        </strong>
        <small>DESKTOP CODING AGENT</small>
        <div className="boot-status">
          <Loader2 size={13} className="spin" /> Preparing your workspace…
        </div>
      </div>
    );
  }

  const sidebar = (() => {
    switch (activeView) {
      case 'search':
        return <SearchPanel onOpenFileAt={openFileAt} />;
      case 'git':
        return (
          <SourceControlPanel
            onRefresh={refreshGit}
            onOpenFile={openFile}
            onShowDiff={showDiff}
            onOpenGithub={() => patch({ activeView: 'github' })}
          />
        );
      case 'github':
        return <GitHubPanel onOpenSettings={() => openSettings('github')} onOpenWorkspace={openWorkspace} onRefreshGit={refreshGit} />;
      default:
        return (
          <ExplorerPanel
            onOpenFile={openFile}
            onOpenRecent={openRecent}
            onNewFile={() => setNewItem({ type: 'file', parent: activePath ? dirName(activePath) : '' })}
            onNewFolder={() => setNewItem({ type: 'directory', parent: activePath ? dirName(activePath) : '' })}
            onRefresh={() => void refreshFiles()}
            onRename={(path) => void renameItem(path)}
            onDelete={(path) => void deleteItem(path)}
          />
        );
    }
  })();

  return (
    <div className="app-shell">
      <TopBar
        onOpenFolder={() => void openFolder()}
        onNewProject={() => patch({ newProjectOpen: true })}
        onSettings={() => openSettings()}
        onPalette={() => patch({ paletteOpen: true })}
        onPush={() => void pushChanges()}
        onUndo={() => void undoLast()}
        onRefresh={() => void refreshWorkspace()}
        onToggleSidebar={() => patch({ sidebarOpen: !sidebarOpen })}
        onToggleChat={() => patch({ rightOpen: !rightOpen, rightTab: 'chat' })}
        onToggleBottom={() => patch({ bottomOpen: !bottomOpen, bottomTab: 'terminal' })}
      />

      <div className="workbench">
        <ActivityBar onSettings={() => openSettings()} onAbout={() => openSettings('about')} />

        {sidebarOpen && <aside className="sidebar">{sidebar}</aside>}

        <section className="center-column">
          <EditorPane
            onOpenFolder={() => void openFolder()}
            onOpenRecent={(recent) => void openRecent(recent)}
            onNewFile={() => setNewItem({ type: 'file', parent: activePath ? dirName(activePath) : '' })}
            onNewProject={() => patch({ newProjectOpen: true })}
            onOpenSettings={() => openSettings()}
            onSave={(path) => void saveFile(path)}
            onRename={(path) => void renameItem(path)}
            onDelete={(path) => void deleteItem(path)}
          />
          {bottomOpen && <BottomPanel />}
        </section>

        {rightOpen && (
          <aside className="right-panel">
            <div className="right-tabbar">
              <div className="right-tabs">
                <button
                  type="button"
                  className={'right-tab ' + (rightTab === 'chat' ? 'active' : '')}
                  onClick={() => patch({ rightTab: 'chat' })}
                >
                  <Sparkles size={13} /> Assistant
                  {busy && <span className="right-busy-dot" />}
                  {approvals.length > 0 && <span className="right-count">{approvals.length}</span>}
                </button>
                <button
                  type="button"
                  className={'right-tab ' + (rightTab === 'preview' ? 'active' : '')}
                  onClick={() => patch({ rightTab: 'preview' })}
                >
                  <Globe2 size={13} /> Preview
                </button>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="Hide right panel"
                onClick={() => patch({ rightOpen: false })}
              >
                <PanelRight size={14} />
              </button>
            </div>
            <div className="right-content">
              {rightTab === 'chat' ? (
                <ChatPanel
                  onOpenFolder={() => void openFolder()}
                  onOpenSettings={() => openSettings()}
                  onApplyCode={(code, language) => {
                    const extension = language || 'txt';
                    const fallback = activePath || `snippet.${extension}`;
                    setApplyCode({ code, language, defaultPath: fallback });
                  }}
                />
              ) : (
                <PreviewPanel onOpenSettings={() => openSettings()} />
              )}
            </div>
          </aside>
        )}
      </div>

      <StatusBar onOpenSettings={() => openSettings()} />

      <Toasts />
      <ConfirmDialog />
      <PromptDialog />
      <ApprovalModal />

      {settingsOpen && settings && (
        <SettingsModal
          onClose={() => patch({ settingsOpen: false })}
          appInfo={appInfo}
          onRefreshModels={loadModels}
          initialSection={settingsSection || undefined}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onOpenFile={(path) => void openFile(path)}
        onClose={() => patch({ paletteOpen: false })}
      />

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => patch({ newProjectOpen: false })}
        onCreated={async (folder) => {
          await openWorkspace(folder);
          await refreshGit();
        }}
      />

      <NewItemModal
        state={newItem}
        onClose={() => setNewItem(null)}
        onCreate={createItem}
      />

      <ApplyCodeModal
        state={applyCode}
        onClose={() => setApplyCode(null)}
        onApply={async (path, code) => {
          const state = useStudio.getState();
          if (!state.root) {
            state.showToast({ kind: 'warning', title: 'Open a project first' });
            return false;
          }
          const exists = state.files.some(entry => entry.type === 'file' && entry.path === path);
          if (exists) {
            const ok = await state.askConfirm({
              title: 'Overwrite this file?',
              message: `“${path}” already exists. The new code replaces its full contents.`,
              confirmLabel: 'Overwrite file',
              danger: true
            });
            if (!ok) return false;
          }
          try {
            await window.studio.writeFile(state.root, path, code);
            await refreshFiles();
            await openFile(path);
            const opened = useStudio.getState().tabs.find(tab => tab.path === path);
            if (opened) useStudio.getState().markTabSaved(path, code);
            void refreshGit();
            state.showToast({ kind: 'success', title: 'Code applied', message: path });
            return true;
          } catch (error) {
            state.showToast({ kind: 'error', title: 'Could not apply code', message: String(error) });
            return false;
          }
        }}
      />

      <DiffModal state={diff} onClose={() => setDiff(null)} />
    </div>
  );
}
