import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Command,
  Folder,
  GitBranch,
  Github,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Undo2,
  Upload,
  Zap
} from 'lucide-react';
import { useStudio } from '../lib/store';
import { baseName, projectName } from '../lib/utils';

type Props = {
  onOpenFolder: () => void;
  onNewProject: () => void;
  onSettings: () => void;
  onPalette: () => void;
  onPush: () => void;
  onUndo: () => void;
  onRefresh: () => void;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  onToggleBottom: () => void;
};

export function TopBar({
  onOpenFolder,
  onNewProject,
  onSettings,
  onPalette,
  onPush,
  onUndo,
  onRefresh,
  onToggleSidebar,
  onToggleChat,
  onToggleBottom
}: Props) {
  const root = useStudio(state => state.root);
  const git = useStudio(state => state.git);
  const settings = useStudio(state => state.settings);
  const models = useStudio(state => state.models);
  const modelsLoading = useStudio(state => state.modelsLoading);
  const busy = useStudio(state => state.busy);
  const currentStep = useStudio(state => state.currentStep);
  const setSettings = useStudio(state => state.setSettings);
  const showToast = useStudio(state => state.showToast);
  const tabs = useStudio(state => state.tabs);
  const sidebarOpen = useStudio(state => state.sidebarOpen);
  const rightOpen = useStudio(state => state.rightOpen);
  const bottomOpen = useStudio(state => state.bottomOpen);
  const [modelOpen, setModelOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [freeOnly, setFreeOnly] = useState(true);
  const popRef = useRef<HTMLDivElement>(null);

  const provider = settings?.modelProvider || 'gemini';
  const activeModel = provider === 'gemini' ? settings?.geminiModel : settings?.openrouterModel;

  useEffect(() => {
    if (!modelOpen) return;
    const onClick = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) setModelOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [modelOpen]);

  const visibleModels = useMemo(() => {
    return models
      .filter(model => provider === 'gemini' || !freeOnly || model.isFree || model.id.endsWith(':free'))
      .filter(model => (model.name + ' ' + model.id).toLowerCase().includes(search.toLowerCase()))
      .slice(0, 120);
  }, [models, provider, freeOnly, search]);

  const dirtyCount = tabs.filter(tab => tab.content !== tab.savedContent).length;

  const chooseModel = async (id: string) => {
    if (!settings) return;
    try {
      const snapshot = await window.studio.updateSettings(
        provider === 'gemini' ? { geminiModel: id } : { openrouterModel: id }
      );
      setSettings(snapshot);
      setModelOpen(false);
      showToast({ kind: 'success', title: 'Model selected', message: id });
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not save model', message: String(error) });
    }
  };

  return (
    <header className="topbar">
      <div className="brand" title="DARKI Code Studio">
        <div className="brand-mark">
          <Zap size={18} />
        </div>
        <div className="brand-text">
          <strong>
            DARKI<span> CODE</span>
          </strong>
          <small>STUDIO</small>
        </div>
      </div>

      <div className="topbar-divider" />

      <div className="topbar-project">
        <button type="button" className="project-pill" onClick={onOpenFolder} title="Switch project">
          <Folder size={14} />
          <span>{root ? projectName(root) : 'Open a project'}</span>
          <ChevronDown size={12} />
        </button>
        {root && git?.isRepo && (
          <button
            type="button"
            className="branch-pill"
            onClick={() => useStudio.getState().patch({ activeView: 'git', sidebarOpen: true })}
            title="Open source control"
          >
            <GitBranch size={12} />
            {git.branch || 'detached'}
            {dirtyCount > 0 && <span className="branch-dirty">{dirtyCount}</span>}
            {git.ahead > 0 && <span className="ahead">↑{git.ahead}</span>}
          </button>
        )}
        {busy && (
          <div className="working-pill">
            <span className="pulse-dot" />
            {currentStep || 'Agent working'}
          </div>
        )}
      </div>

      <div className="topbar-center">
        <button type="button" className="palette-trigger" onClick={onPalette}>
          <Search size={14} />
          <span>Search files, commands, actions…</span>
          <kbd>
            <Command size={11} /> K
          </kbd>
        </button>
      </div>

      <div className="topbar-actions">
        {root && (
          <button type="button" className="btn icon-only soft" title="Refresh workspace" onClick={onRefresh}>
            <RefreshCw size={14} />
          </button>
        )}
        <button type="button" className="btn icon-only soft" title="Undo last AI edit" onClick={onUndo} disabled={!root}>
          <Undo2 size={14} />
        </button>

        <div className="model-wrap" ref={popRef}>
          <button
            type="button"
            className={'model-button ' + (modelOpen ? 'open' : '')}
            onClick={() => setModelOpen(value => !value)}
            title="Select model"
          >
            <span className={'provider-dot provider-' + provider} />
            <span className="model-label">{activeModel || 'Select a model'}</span>
            <ChevronDown size={13} />
          </button>
          {modelOpen && (
            <div className="model-pop">
              <div className="model-pop-head">
                <div>
                  <span className="eyebrow">ACTIVE PROVIDER</span>
                  <strong>{provider === 'gemini' ? 'Google Gemini' : 'OpenRouter'}</strong>
                </div>
                <button type="button" className="btn ghost tiny" onClick={onSettings}>
                  <Settings size={12} /> Configure
                </button>
              </div>
              <div className="model-search">
                <Search size={13} />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search models…"
                  autoFocus
                />
              </div>
              {provider === 'openrouter' && (
                <label className="check-row">
                  <input type="checkbox" checked={freeOnly} onChange={event => setFreeOnly(event.target.checked)} />
                  Show free models only
                </label>
              )}
              <div className="model-list">
                {modelsLoading && <p className="model-empty"><span className="spinner" /> Loading models…</p>}
                {!modelsLoading && !visibleModels.length && (
                  <div className="model-empty-block">
                    <p>
                      {provider === 'gemini' && !settings?.hasGeminiKey
                        ? 'Add a Gemini API key to load available models.'
                        : 'No models match this filter.'}
                    </p>
                    <button type="button" className="btn secondary tiny" onClick={onSettings}>
                      Open provider settings
                    </button>
                  </div>
                )}
                {visibleModels.map(model => (
                  <button
                    type="button"
                    key={model.id}
                    className={'model-row ' + (model.id === activeModel ? 'selected' : '')}
                    onClick={() => void chooseModel(model.id)}
                  >
                    <span className="model-row-main">
                      <strong>{model.name}</strong>
                      <small>{model.id}</small>
                    </span>
                    <span className="model-tags">
                      {model.recommended && <em className="tag rec">Recommended</em>}
                      {model.isFree && <em className="tag free">Free</em>}
                      {model.supportsTools && <em className="tag tools">Tools</em>}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="model-pop-foot"
                onClick={() => {
                  setModelOpen(false);
                  onSettings();
                }}
              >
                <Sparkles size={13} /> More models &amp; fallback settings
              </button>
            </div>
          )}
        </div>

        <button type="button" className="btn icon-only soft" title="GitHub" onClick={() => useStudio.getState().patch({ activeView: 'github', sidebarOpen: true })}>
          <Github size={15} />
        </button>
        <button type="button" className="btn icon-only soft" title="Settings" onClick={onSettings}>
          <Settings size={16} />
        </button>

        <div className="view-toggles">
          <button type="button" className={'btn icon-only ghost-toggle ' + (sidebarOpen ? 'active' : '')} title="Toggle explorer" onClick={onToggleSidebar}>
            <PanelLeft size={15} />
          </button>
          <button type="button" className={'btn icon-only ghost-toggle ' + (rightOpen ? 'active' : '')} title="Toggle assistant" onClick={onToggleChat}>
            <PanelRight size={15} />
          </button>
          <button type="button" className={'btn icon-only ghost-toggle ' + (bottomOpen ? 'active' : '')} title="Toggle terminal" onClick={onToggleBottom}>
            <PanelBottom size={15} />
          </button>
        </div>

        {root && (
          <button type="button" className="btn primary push-button" onClick={onPush} title="Push committed changes">
            <Upload size={13} />
            Push
          </button>
        )}
      </div>
    </header>
  );
}
