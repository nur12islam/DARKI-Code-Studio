import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  Github,
  HardDrive,
  Info,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Unplug,
  X,
  Zap
} from 'lucide-react';
import { useStudio } from '../lib/store';
import type { AppInfo, Provider, ProviderTestResult, PublicSettings, SettingsSection } from '../lib/types';

type Props = {
  onClose: () => void;
  appInfo: AppInfo | null;
  onRefreshModels: (provider: Provider) => Promise<void>;
  initialSection?: SettingsSection;
};

type Section = SettingsSection;

const SECTIONS: Array<{ id: Section; label: string; icon: typeof KeyRound; hint: string }> = [
  { id: 'providers', label: 'Providers', icon: KeyRound, hint: 'API keys & models' },
  { id: 'agent', label: 'Agent', icon: Bot, hint: 'Approvals & sampling' },
  { id: 'editor', label: 'Editor', icon: SlidersHorizontal, hint: 'Fonts & wrapping' },
  { id: 'github', label: 'Git & GitHub', icon: Github, hint: 'Token & identity' },
  { id: 'about', label: 'About', icon: Info, hint: 'Version & security' }
];

const APPROVALS: Array<{
  id: PublicSettings['approvalMode'];
  label: string;
  description: string;
  icon: typeof ShieldCheck;
  tone: string;
}> = [
  {
    id: 'ask',
    label: 'Ask before every action',
    description: 'Review a real diff before writes, and confirm commands and Git operations.',
    icon: ShieldCheck,
    tone: 'cyan'
  },
  {
    id: 'edits',
    label: 'Auto-apply file edits',
    description: 'Writes land immediately. Commands, deletions and Git actions still ask.',
    icon: Zap,
    tone: 'violet'
  },
  {
    id: 'readonly',
    label: 'Read-only review',
    description: 'The agent can inspect and explain, but never modify the project.',
    icon: Shield,
    tone: 'amber'
  }
];

export function SettingsModal({ onClose, appInfo, onRefreshModels, initialSection }: Props) {
  const settings = useStudio(state => state.settings);
  const models = useStudio(state => state.models);
  const modelsLoading = useStudio(state => state.modelsLoading);
  const modelsError = useStudio(state => state.modelsError);
  const setSettings = useStudio(state => state.setSettings);
  const showToast = useStudio(state => state.showToast);
  const askConfirm = useStudio(state => state.askConfirm);

  const [section, setSection] = useState<Section>(initialSection || 'providers');
  const [saving, setSaving] = useState<string | null>(null);
  const [geminiDraft, setGeminiDraft] = useState('');
  const [openrouterDraft, setOpenrouterDraft] = useState('');
  const [githubDraft, setGithubDraft] = useState('');
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenrouter, setShowOpenrouter] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [testing, setTesting] = useState<Provider | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<Provider, ProviderTestResult>>>({});
  const [modelSearch, setModelSearch] = useState('');
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [verifyingGithub, setVerifyingGithub] = useState(false);
  const [temperature, setTemperature] = useState(settings?.temperature ?? 0.2);
  const [fallbackDraft, setFallbackDraft] = useState(settings?.fallbackModels || '');
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setTemperature(settings?.temperature ?? 0.2);
    setFallbackDraft(settings?.fallbackModels || '');
  }, [settings?.temperature, settings?.fallbackModels]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(null), 2200);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  const activeProvider: Provider = settings?.modelProvider || 'gemini';
  const visibleModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return models
      .filter(model => !query || (model.name + ' ' + model.id).toLowerCase().includes(query))
      .slice(0, 100);
  }, [models, modelSearch]);

  if (!settings) return null;

  const flash = (message: string) => {
    setSavedFlash(message);
    showToast({ kind: 'success', title: message });
  };

  const savePatch = async (patch: Partial<Record<string, unknown>>, label?: string) => {
    const key = label || 'settings';
    setSaving(key);
    try {
      const snapshot = await window.studio.updateSettings(patch);
      setSettings(snapshot);
      if (label) flash(label);
      return snapshot;
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not save settings', message: String(error) });
      return null;
    } finally {
      setSaving(null);
    }
  };

  const selectProvider = async (provider: Provider) => {
    if (provider === activeProvider) return;
    setModelSearch('');
    await savePatch({ modelProvider: provider });
  };

  const saveSecret = async (provider: Provider) => {
    const value = provider === 'gemini' ? geminiDraft : openrouterDraft;
    if (!value.trim()) {
      showToast({ kind: 'warning', title: 'Paste an API key first' });
      return;
    }
    const snapshot = await savePatch(
      provider === 'gemini' ? { geminiKey: value.trim() } : { openrouterKey: value.trim() },
      provider === 'gemini' ? 'Gemini key saved' : 'OpenRouter key saved'
    );
    if (!snapshot) return;
    if (provider === 'gemini') setGeminiDraft('');
    else setOpenrouterDraft('');
    setTestResults(current => ({ ...current, [provider]: undefined }));
  };

  const clearSecret = async (secret: 'geminiKey' | 'openrouterKey' | 'githubToken') => {
    const ok = await askConfirm({
      title: 'Remove this credential?',
      message: 'The saved secret will be deleted from encrypted storage. You can add a new one at any time.',
      confirmLabel: 'Remove credential',
      danger: true
    });
    if (!ok) return;
    setSaving(secret);
    try {
      const snapshot = await window.studio.clearSecret(secret);
      setSettings(snapshot);
      setTestResults(current => ({
        ...current,
        [secret === 'geminiKey' ? 'gemini' : 'openrouter']: undefined
      }));
      flash('Credential removed');
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not remove credential', message: String(error) });
    } finally {
      setSaving(null);
    }
  };

  const test = async (provider: Provider) => {
    setTesting(provider);
    try {
      const result = await window.studio.testProvider(provider);
      setTestResults(current => ({ ...current, [provider]: result }));
      if (result.ok) void onRefreshModels(provider);
    } catch (error) {
      setTestResults(current => ({
        ...current,
        [provider]: { ok: false, provider, message: String(error) }
      }));
    } finally {
      setTesting(null);
    }
  };

  const chooseModel = async (provider: Provider, id: string) => {
    await savePatch(provider === 'gemini' ? { geminiModel: id } : { openrouterModel: id }, 'Model selected');
  };

  const refreshModels = async () => {
    setRefreshingModels(true);
    try {
      await onRefreshModels(activeProvider);
    } finally {
      setRefreshingModels(false);
    }
  };

  const verifyGithub = async (justSaved = false) => {
    setVerifyingGithub(true);
    try {
      const user = await window.studio.githubVerify();
      const snapshot = await window.studio.getSettings();
      setSettings(snapshot);
      flash(justSaved ? `GitHub token saved as @${user.login}` : `Verified @${user.login}`);
    } catch (error) {
      showToast({ kind: 'error', title: 'GitHub verification failed', message: String(error) });
    } finally {
      setVerifyingGithub(false);
    }
  };

  const saveGithub = async () => {
    if (!githubDraft.trim()) {
      showToast({ kind: 'warning', title: 'Paste a GitHub token first' });
      return;
    }
    const snapshot = await savePatch({ githubToken: githubDraft.trim() }, 'GitHub token saved');
    if (!snapshot) return;
    setGithubDraft('');
    await verifyGithub(true);
  };

  const commitTemperature = (value: number) => {
    setTemperature(value);
    void savePatch({ temperature: value });
  };

  const commitFallback = () => {
    if (fallbackDraft === settings.fallbackModels) return;
    void savePatch({ fallbackModels: fallbackDraft }, 'Fallback models saved');
  };

  const resetDefaults = async () => {
    const ok = await askConfirm({
      title: 'Reset agent defaults?',
      message: 'Approval mode returns to “Ask before every action”, temperature to 0.2 and fallback to openrouter/free.',
      confirmLabel: 'Reset defaults'
    });
    if (!ok) return;
    setTemperature(0.2);
    setFallbackDraft('openrouter/free');
    await savePatch({ approvalMode: 'ask', temperature: 0.2, fallbackModels: 'openrouter/free', autoFallback: true }, 'Agent defaults restored');
  };

  const providerKeyState = activeProvider === 'gemini' ? settings.hasGeminiKey : settings.hasOpenRouterKey;
  const providerHint = activeProvider === 'gemini' ? settings.geminiKeyHint : settings.openrouterKeyHint;
  const providerDraft = activeProvider === 'gemini' ? geminiDraft : openrouterDraft;
  const setProviderDraft = activeProvider === 'gemini' ? setGeminiDraft : setOpenrouterDraft;
  const providerVisible = activeProvider === 'gemini' ? showGemini : showOpenrouter;
  const setProviderVisible = activeProvider === 'gemini' ? setShowGemini : setShowOpenrouter;
  const activeModel = activeProvider === 'gemini' ? settings.geminiModel : settings.openrouterModel;
  const activeTest = testResults[activeProvider];

  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={event => event.stopPropagation()}
      >
        <aside className="settings-nav">
          <div className="settings-brand">
            <span className="brand-mark">
              <Zap size={17} />
            </span>
            <div>
              <strong>
                DARKI<span> CODE</span>
              </strong>
              <small>SETTINGS</small>
            </div>
          </div>

          <div className="settings-nav-list">
            {SECTIONS.map(item => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={'settings-nav-item ' + (section === item.id ? 'active' : '')}
                  onClick={() => setSection(item.id)}
                >
                  <Icon size={16} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  <ChevronRight size={12} />
                </button>
              );
            })}
          </div>

          <div className="settings-nav-foot">
            <div className={'settings-auth ' + (settings.encryptionAvailable ? 'ok' : 'warn')}>
              {settings.encryptionAvailable ? <Lock size={12} /> : <ShieldAlert size={12} />}
              <span>
                {settings.encryptionAvailable ? 'Credentials encrypted' : 'Encryption unavailable'}
              </span>
            </div>
            <div className="settings-version">v{appInfo?.version || '0.2.0'}</div>
          </div>
        </aside>

        <div className="settings-main">
          <header className="settings-head">
            <div>
              <span className="eyebrow">
                {SECTIONS.find(item => item.id === section)?.hint.toUpperCase()}
              </span>
              <h2>{SECTIONS.find(item => item.id === section)?.label}</h2>
            </div>
            <div className="settings-head-actions">
              {savedFlash && (
                <span className="saved-flash">
                  <Check size={12} /> {savedFlash}
                </span>
              )}
              <button type="button" className="icon-btn large" title="Close settings" onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="settings-scroll">
            {section === 'providers' && (
              <>
                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Active provider</h3>
                      <p>Select which model service DARKI uses for chat and tool calls.</p>
                    </div>
                  </div>
                  <div className="provider-grid">
                    <button
                      type="button"
                      className={'provider-card ' + (activeProvider === 'gemini' ? 'active' : '')}
                      onClick={() => void selectProvider('gemini')}
                    >
                      <span className="provider-logo gemini">
                        <Sparkles size={17} />
                      </span>
                      <span>
                        <strong>Google Gemini</strong>
                        <small>Native model discovery · generous context</small>
                      </span>
                      <span className={'provider-state ' + (settings.hasGeminiKey ? 'on' : 'off')}>
                        {settings.hasGeminiKey ? <Check size={10} /> : <Unplug size={10} />}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={'provider-card ' + (activeProvider === 'openrouter' ? 'active' : '')}
                      onClick={() => void selectProvider('openrouter')}
                    >
                      <span className="provider-logo openrouter">
                        <Cpu size={17} />
                      </span>
                      <span>
                        <strong>OpenRouter</strong>
                        <small>Many models, free routing and fallbacks</small>
                      </span>
                      <span className={'provider-state ' + (settings.hasOpenRouterKey ? 'on' : 'off')}>
                        {settings.hasOpenRouterKey ? <Check size={10} /> : <Unplug size={10} />}
                      </span>
                    </button>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>{activeProvider === 'gemini' ? 'Gemini' : 'OpenRouter'} API key</h3>
                      <p>
                        {providerKeyState
                          ? `A saved key (${providerHint || '••••'}) is connected. Paste a new key only to replace it.`
                          : 'Paste a key from your provider dashboard. It is encrypted with the operating system credential store.'}
                      </p>
                    </div>
                    <span className={'credential-pill ' + (providerKeyState ? 'on' : 'off')}>
                      {providerKeyState ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {providerKeyState ? 'Connected' : 'Not connected'}
                    </span>
                  </div>

                  <div className="secret-row">
                    <div className="secret-input">
                      <KeyRound size={14} />
                      <input
                        type={providerVisible ? 'text' : 'password'}
                        value={providerDraft}
                        onChange={event => setProviderDraft(event.target.value)}
                        placeholder={providerKeyState ? `Replace ${providerHint || 'saved key'}` : 'Paste API key'}
                        spellCheck={false}
                        autoComplete="off"
                        onKeyDown={event => {
                          if (event.key === 'Enter') void saveSecret(activeProvider);
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn tiny"
                        title={providerVisible ? 'Hide key' : 'Show key'}
                        onClick={() => setProviderVisible(!providerVisible)}
                      >
                        {providerVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => void saveSecret(activeProvider)}
                      disabled={!providerDraft.trim() || Boolean(saving)}
                    >
                      {saving === (activeProvider === 'gemini' ? 'Gemini key saved' : 'OpenRouter key saved') ? (
                        <Loader2 size={13} className="spin" />
                      ) : (
                        <Save size={13} />
                      )}
                      Save key
                    </button>
                    {providerKeyState && (
                      <button
                        type="button"
                        className="btn ghost danger-hover"
                        onClick={() => void clearSecret(activeProvider === 'gemini' ? 'geminiKey' : 'openrouterKey')}
                        disabled={Boolean(saving)}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    )}
                  </div>

                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      className="btn secondary tiny"
                      onClick={() => void test(activeProvider)}
                      disabled={!providerKeyState || testing !== null}
                    >
                      {testing === activeProvider ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
                      Test connection
                    </button>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() =>
                        void window.studio.openExternal(
                          activeProvider === 'gemini'
                            ? 'https://aistudio.google.com/app/apikey'
                            : 'https://openrouter.ai/keys'
                        )
                      }
                    >
                      <ExternalLink size={11} /> Get a key
                    </button>
                    <span className="settings-hint">
                      <Lock size={10} /> Stored in the main process only
                    </span>
                  </div>

                  {activeTest && (
                    <div className={'test-result ' + (activeTest.ok ? 'ok' : 'fail')}>
                      {activeTest.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                      <div>
                        <strong>{activeTest.message}</strong>
                        {activeTest.detail && <span>{activeTest.detail}</span>}
                        {activeTest.models !== undefined && (
                          <small>
                            {activeTest.models} model{activeTest.models === 1 ? '' : 's'} discovered
                            {activeTest.account ? ` · ${activeTest.account}` : ''}
                          </small>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Model</h3>
                      <p>Models are discovered live from the selected provider and filtered to text/tool models.</p>
                    </div>
                    <button type="button" className="btn ghost tiny" onClick={() => void refreshModels()} disabled={!providerKeyState || refreshingModels}>
                      {refreshingModels || modelsLoading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                      Refresh
                    </button>
                  </div>

                  <div className="model-picker-head">
                    <div className="model-search">
                      <Sparkles size={13} />
                      <input
                        value={modelSearch}
                        onChange={event => setModelSearch(event.target.value)}
                        placeholder="Filter models"
                      />
                    </div>
                    <span className="settings-hint">{models.length} available</span>
                  </div>

                  {modelsError && <div className="inline-error">{modelsError}</div>}

                  <div className="settings-model-list">
                    {visibleModels.map(model => (
                      <button
                        type="button"
                        key={model.id}
                        className={'settings-model-row ' + (model.id === activeModel ? 'active' : '')}
                        onClick={() => void chooseModel(activeProvider, model.id)}
                      >
                        <span className="settings-model-check">
                          {model.id === activeModel && <Check size={11} />}
                        </span>
                        <span className="settings-model-copy">
                          <strong>{model.name}</strong>
                          <small>{model.id}</small>
                        </span>
                        <span className="settings-model-tags">
                          {model.recommended && <em className="tag rec">Recommended</em>}
                          {model.isFree && <em className="tag free">Free</em>}
                          {model.supportsTools && <em className="tag tools">Tools</em>}
                          {model.contextLength ? <em className="tag">{Math.round(model.contextLength / 1000)}k ctx</em> : null}
                        </span>
                      </button>
                    ))}
                    {!visibleModels.length && !modelsLoading && (
                      <div className="settings-empty">
                        {providerKeyState
                          ? 'No models loaded. Use Refresh to query the provider.'
                          : 'Add an API key to load models.'}
                      </div>
                    )}
                    {modelsLoading && (
                      <div className="settings-empty">
                        <Loader2 size={14} className="spin" /> Loading models…
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {section === 'agent' && (
              <>
                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Approval policy</h3>
                      <p>The agent pauses before actions that can change your project. Diffs are shown before they land.</p>
                    </div>
                    <button type="button" className="btn ghost tiny" onClick={() => void resetDefaults()}>
                      <RotateCcw size={11} /> Reset
                    </button>
                  </div>
                  <div className="approval-grid">
                    {APPROVALS.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={'approval-card tone-' + item.tone + (settings.approvalMode === item.id ? ' active' : '')}
                          onClick={() => void savePatch({ approvalMode: item.id }, 'Approval mode updated')}
                        >
                          <span className="approval-card-icon">
                            <Icon size={16} />
                          </span>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                          <span className={'approval-radio ' + (settings.approvalMode === item.id ? 'on' : '')}>
                            {settings.approvalMode === item.id && <Check size={10} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {settings.approvalMode === 'readonly' && (
                    <div className="settings-note warn">
                      <ShieldAlert size={14} />
                      Read-only mode blocks all writes, commands and Git tools. Switch back to ask or auto-edit when you
                      want changes applied.
                    </div>
                  )}
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Sampling</h3>
                      <p>Lower temperature is more deterministic and better for code edits.</p>
                    </div>
                    <span className="settings-value">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    className="range-input"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={temperature}
                    onChange={event => setTemperature(Number(event.target.value))}
                    onPointerUp={() => commitTemperature(temperature)}
                    onKeyUp={() => commitTemperature(temperature)}
                    onBlur={() => commitTemperature(temperature)}
                  />
                  <div className="range-labels">
                    <span>Precise</span>
                    <span>0.2 default</span>
                    <span>Creative</span>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Fallback models</h3>
                      <p>OpenRouter can retry with alternate models when the primary model is rate-limited or unavailable.</p>
                    </div>
                  </div>
                  <label className="switch-row">
                    <span>
                      <strong>Automatic fallback</strong>
                      <small>Pass fallback models to OpenRouter with each request.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.autoFallback}
                      onChange={event => void savePatch({ autoFallback: event.target.checked }, 'Fallback preference updated')}
                    />
                  </label>
                  <label className="field-label">Fallback model IDs (comma separated)</label>
                  <div className="inline-field">
                    <input
                      className="text-input"
                      value={fallbackDraft}
                      onChange={event => setFallbackDraft(event.target.value)}
                      onBlur={commitFallback}
                      placeholder="openrouter/free, google/gemini-3.8-flash"
                      disabled={!settings.autoFallback}
                    />
                    <button type="button" className="btn secondary" onClick={commitFallback} disabled={!settings.autoFallback}>
                      <Save size={13} /> Save
                    </button>
                  </div>
                  <div className="settings-note">
                    <Info size={13} />
                    Gemini routes built-in fallbacks on Google’s side. This list is used by OpenRouter requests and by the
                    top bar model switcher.
                  </div>
                </section>

                <section className="settings-card compact">
                  <div className="agent-limit-row">
                    <span>
                      <strong>Agent loop</strong>
                      <small>Up to 20 tool steps per turn, then DARKI pauses and asks for direction.</small>
                    </span>
                    <span className="tag tools">20 steps</span>
                  </div>
                  <div className="agent-limit-row">
                    <span>
                      <strong>Approval timeout</strong>
                      <small>Pending approvals expire after three minutes to avoid stale actions.</small>
                    </span>
                    <span className="tag">180s</span>
                  </div>
                  <div className="agent-limit-row">
                    <span>
                      <strong>Undo history</strong>
                      <small>The last 50 AI file operations can be reverted from the top bar.</small>
                    </span>
                    <span className="tag">50 edits</span>
                  </div>
                </section>
              </>
            )}

            {section === 'editor' && (
              <>
                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Editor appearance</h3>
                      <p>Settings apply to every open file immediately.</p>
                    </div>
                  </div>
                  <div className="editor-setting-row">
                    <div>
                      <strong>Font size</strong>
                      <small>Monaco editor and diff panels.</small>
                    </div>
                    <div className="stepper">
                      <button
                        type="button"
                        onClick={() => void savePatch({ editorFontSize: Math.max(11, settings.editorFontSize - 1) })}
                        disabled={settings.editorFontSize <= 11}
                      >
                        −
                      </button>
                      <span>{settings.editorFontSize}px</span>
                      <button
                        type="button"
                        onClick={() => void savePatch({ editorFontSize: Math.min(22, settings.editorFontSize + 1) })}
                        disabled={settings.editorFontSize >= 22}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="editor-preview" style={{ fontSize: settings.editorFontSize }}>
                    <span className="preview-line-number">1</span>
                    <code>
                      <span className="tok-key">const</span> <span className="tok-var">agent</span> ={' '}
                      <span className="tok-fn">createStudio</span>();
                    </code>
                  </div>
                  <label className="switch-row">
                    <span>
                      <strong>Word wrap</strong>
                      <small>Wrap long lines inside the editor instead of horizontal scrolling.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.editorWordWrap}
                      onChange={event => void savePatch({ editorWordWrap: event.target.checked }, 'Editor wrap updated')}
                    />
                  </label>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Theme</h3>
                      <p>DARKI Obsidian is the built-in high-contrast dark theme.</p>
                    </div>
                  </div>
                  <div className="theme-preview">
                    <div className="theme-swatch bg" />
                    <div className="theme-swatch cyan" />
                    <div className="theme-swatch violet" />
                    <div className="theme-swatch green" />
                    <span>Obsidian · Cyan · Violet</span>
                    <span className="tag rec">Active</span>
                  </div>
                </section>
              </>
            )}

            {section === 'github' && (
              <>
                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>GitHub token</h3>
                      <p>
                        {settings.hasGithubToken
                          ? `A saved token (${settings.githubTokenHint || '••••'}) is connected${settings.githubLogin ? ` for @${settings.githubLogin}` : ''}.`
                          : 'Paste a fine-grained or classic personal access token to publish and manage repositories.'}
                      </p>
                    </div>
                    <span className={'credential-pill ' + (settings.hasGithubToken ? 'on' : 'off')}>
                      {settings.hasGithubToken ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {settings.hasGithubToken ? 'Connected' : 'Not connected'}
                    </span>
                  </div>

                  <div className="secret-row">
                    <div className="secret-input">
                      <Github size={14} />
                      <input
                        type={showGithub ? 'text' : 'password'}
                        value={githubDraft}
                        onChange={event => setGithubDraft(event.target.value)}
                        placeholder={settings.hasGithubToken ? `Replace ${settings.githubTokenHint || 'saved token'}` : 'ghp_… or github_pat_…'}                        spellCheck={false}
                        autoComplete="off"
                        onKeyDown={event => {
                          if (event.key === 'Enter') void saveGithub();
                        }}
                      />
                      <button type="button" className="icon-btn tiny" title="Show token" onClick={() => setShowGithub(!showGithub)}>
                        {showGithub ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <button type="button" className="btn primary" onClick={() => void saveGithub()} disabled={!githubDraft.trim() || Boolean(saving)}>
                      {saving === 'GitHub token saved' ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save token
                    </button>
                    {settings.hasGithubToken && (
                      <button type="button" className="btn ghost danger-hover" onClick={() => void clearSecret('githubToken')}>
                        <Trash2 size={13} /> Remove
                      </button>
                    )}
                  </div>

                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      className="btn secondary tiny"
                      onClick={() => void verifyGithub(false)}
                      disabled={!settings.hasGithubToken || verifyingGithub}
                    >
                      {verifyingGithub ? <Loader2 size={12} className="spin" /> : <Github size={12} />} Verify account
                    </button>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() => void window.studio.openExternal('https://github.com/settings/tokens')}
                    >
                      <ExternalLink size={11} /> Create a token
                    </button>
                  </div>

                  {settings.githubLogin && (
                    <div className="settings-note">
                      <CheckCircle2 size={13} /> Signed in as <strong>@{settings.githubLogin}</strong>. HTTPS pushes use this
                      token without saving it inside the repository.
                    </div>
                  )}

                  <div className="scope-grid">
                    <div>
                      <span className="eyebrow">CLASSIC TOKEN SCOPES</span>
                      <code>repo</code>
                      <code>read:user</code>
                    </div>
                    <div>
                      <span className="eyebrow">FINE-GRAINED PERMISSIONS</span>
                      <code>Contents: RW</code>
                      <code>Pull requests: RW</code>
                      <code>Metadata: R</code>
                    </div>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Credential security</h3>
                      <p>Secrets never enter the renderer, chat history or project files.</p>
                    </div>
                  </div>
                  <div className="security-list">
                    <div>
                      <Lock size={13} />
                      <span>
                        <strong>OS-backed encryption</strong>
                        <small>{settings.encryptionAvailable ? 'safeStorage is available on this machine.' : 'Encryption is unavailable; keys cannot be persisted.'}</small>
                      </span>
                    </div>
                    <div>
                      <ShieldCheck size={13} />
                      <span>
                        <strong>Masked hints only</strong>
                        <small>The renderer receives hasKey and a four-character hint, never the secret.</small>
                      </span>
                    </div>
                    <div>
                      <Terminal size={13} />
                      <span>
                        <strong>Blocked from the agent</strong>
                        <small>Secret files such as .env are denied to tools and preview requests.</small>
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}

            {section === 'about' && (
              <>
                <section className="settings-card about-hero">
                  <span className="brand-mark xl">
                    <Zap size={28} />
                  </span>
                  <div>
                    <span className="eyebrow">DESKTOP AI CODING AGENT</span>
                    <h3>DARKI Code Studio</h3>
                    <p>
                      A focused desktop workspace where an agent can inspect real files, propose diffs, run verified
                      checks and publish to GitHub.
                    </p>
                  </div>
                  <span className="tag rec">v{appInfo?.version || '0.2.0'}</span>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Runtime</h3>
                      <p>Information about the current installation.</p>
                    </div>
                  </div>
                  <div className="about-grid">
                    <div>
                      <span className="eyebrow">APP</span>
                      <strong>{appInfo?.name || 'DARKI Code Studio'}</strong>
                      <small>v{appInfo?.version || '0.2.0'}</small>
                    </div>
                    <div>
                      <span className="eyebrow">PLATFORM</span>
                      <strong>{appInfo?.platform || 'win32'}</strong>
                      <small>Node {appInfo?.node || '—'}</small>
                    </div>
                    <div>
                      <span className="eyebrow">ELECTRON</span>
                      <strong>{appInfo?.electron || '—'}</strong>
                      <small>Sandboxed renderer</small>
                    </div>
                    <div>
                      <span className="eyebrow">ENCRYPTION</span>
                      <strong>{settings.encryptionAvailable ? 'Available' : 'Unavailable'}</strong>
                      <small>{settings.encryptionAvailable ? 'OS credential store' : 'Keys disabled'}</small>
                    </div>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Files &amp; storage</h3>
                      <p>Settings live in the Electron user data directory.</p>
                    </div>
                  </div>
                  <div className="path-row">
                    <HardDrive size={13} />
                    <code title={settings.settingsPath}>{settings.settingsPath}</code>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() => void window.studio.showItemInFolder(settings.settingsPath)}
                    >
                      <FolderOpen size={11} /> Reveal
                    </button>
                  </div>
                  <div className="settings-note">
                    <Info size={13} /> Chat histories are stored per project in the renderer’s local storage. API keys are
                    never written there.
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <h3>Keyboard shortcuts</h3>
                      <p>Work without leaving the keyboard.</p>
                    </div>
                  </div>
                  <div className="shortcut-grid">
                    {[
                      ['⌘/Ctrl K', 'Command palette'],
                      ['⌘/Ctrl S', 'Save active file'],
                      ['⌘/Ctrl B', 'Toggle explorer'],
                      ['⌘/Ctrl J', 'Toggle terminal'],
                      ['⌘/Ctrl ⇧ F', 'Search project'],
                      ['⌘/Ctrl ⇧ G', 'Source control'],
                      ['⌘/Ctrl ⇧ A', 'Open assistant'],
                      ['Esc', 'Close dialogs']
                    ].map(([keys, label]) => (
                      <div key={keys}>
                        <kbd>{keys}</kbd>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="settings-card compact">
                  <div className="about-links">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void window.studio.openExternal('https://github.com/nur12islam/DARKI-Code-Studio')}
                    >
                      <Github size={13} /> GitHub repository
                    </button>
                    <button type="button" className="btn ghost" onClick={() => void openReadme()}>
                      <CircleHelp size={13} /> Documentation
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>

          <footer className="settings-foot">
            <span>
              <Lock size={11} /> Keys stay in the main process
            </span>
            <span className="settings-foot-actions">
              <button type="button" className="btn ghost tiny" onClick={() => void window.studio.openExternal('https://github.com/nur12islam/DARKI-Code-Studio#readme')}>
                <ExternalLink size={11} /> Help
              </button>
              <button type="button" className="btn primary tiny" onClick={onClose}>
                Done
              </button>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function openReadme() {
  return window.studio.openExternal('https://github.com/nur12islam/DARKI-Code-Studio#readme');
}
