import { useMemo } from 'react';
import {
  AlertTriangle,
  Check,
  GitBranch,
  Globe2,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap
} from 'lucide-react';
import { useStudio } from '../lib/store';
import { baseName, isDirty, languageFor, projectName } from '../lib/utils';

export function StatusBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const root = useStudio(state => state.root);
  const git = useStudio(state => state.git);
  const tabs = useStudio(state => state.tabs);
  const activePath = useStudio(state => state.activePath);
  const cursor = useStudio(state => state.editorCursor);
  const settings = useStudio(state => state.settings);
  const busy = useStudio(state => state.busy);
  const currentStep = useStudio(state => state.currentStep);
  const approvals = useStudio(state => state.approvals);
  const searchResults = useStudio(state => state.searchResults);
  const patch = useStudio(state => state.patch);

  const dirty = useMemo(() => tabs.filter(tab => isDirty(tab)).length, [tabs]);
  const active = tabs.find(tab => tab.path === activePath);
  const model = settings?.modelProvider === 'openrouter' ? settings?.openrouterModel : settings?.geminiModel;
  const encrypted = settings?.encryptionAvailable ?? false;
  const hasKey =
    settings?.modelProvider === 'openrouter' ? settings?.hasOpenRouterKey : settings?.hasGeminiKey;

  return (
    <footer className="status-bar">
      <div className="status-group">
        <button
          type="button"
          className="status-item brandish"
          onClick={() => patch({ rightOpen: true, rightTab: 'chat' })}
          title="Open assistant"
        >
          <Zap size={11} />
          <span>DARKI</span>
        </button>
        {git?.isRepo && (
          <button
            type="button"
            className="status-item"
            title={git.remoteUrl || 'Local repository'}
            onClick={() => patch({ activeView: 'git', sidebarOpen: true })}
          >
            <GitBranch size={11} />
            {git.branch}
            {git.ahead > 0 && <em className="status-ahead">↑{git.ahead}</em>}
            {git.behind > 0 && <em className="status-behind">↓{git.behind}</em>}
          </button>
        )}
        {dirty > 0 && (
          <span className="status-item warn" title="Files with unsaved changes">
            <AlertTriangle size={11} />
            {dirty} unsaved
          </span>
        )}
        {approvals.length > 0 && (
          <span className="status-item danger">
            <ShieldCheck size={11} />
            {approvals.length} approval{approvals.length === 1 ? '' : 's'} waiting
          </span>
        )}
      </div>

      <div className="status-center">
        {busy ? (
          <button
            type="button"
            className="status-agent"
            onClick={() => patch({ rightOpen: true, rightTab: 'chat' })}
          >
            <Loader2 size={11} className="spin" />
            {currentStep || 'Agent working'}
          </button>
        ) : (
          <button
            type="button"
            className="status-agent idle"
            onClick={() => patch({ rightOpen: true, rightTab: 'chat' })}
            title="Open assistant"
          >
            <Sparkles size={11} />
            Agent idle
          </button>
        )}
      </div>

      <div className="status-group right">
        {searchResults.length > 0 && <span className="status-item">{searchResults.length} results</span>}
        {active && (
          <>
            <span className="status-item" title="Cursor position">
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span className="status-item" title="Language mode">
              {languageFor(active.path)}
            </span>
          </>
        )}
        <button
          type="button"
          className="status-item"
          title="Open the model and provider settings"
          onClick={onOpenSettings}
        >
          <span className={'provider-dot provider-' + (settings?.modelProvider || 'gemini')} />
          {model ? baseName(model) : 'No model'}
          {hasKey ? <Check size={10} className="status-ok" /> : <AlertTriangle size={10} className="status-warn" />}
        </button>
        <button
          type="button"
          className="status-item"
          title={encrypted ? 'API keys are encrypted with OS credential storage' : 'OS credential encryption is unavailable'}
          onClick={onOpenSettings}
        >
          <Lock size={10} className={encrypted ? 'status-ok' : 'status-warn'} />
        </button>
        <button
          type="button"
          className="status-item"
          title="Show preview"
          onClick={() => patch({ rightOpen: true, rightTab: 'preview' })}
        >
          <Globe2 size={11} />
        </button>
        <button
          type="button"
          className="status-item"
          title={root ? root : 'No project opened'}
          onClick={() => patch({ activeView: 'explorer', sidebarOpen: true })}
        >
          <Wifi size={11} className={root ? 'status-ok' : 'status-muted'} />
          {projectName(root)}
        </button>
      </div>
    </footer>
  );
}
