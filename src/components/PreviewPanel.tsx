import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  ExternalLink,
  FileCode2,
  Globe2,
  Loader2,
  Monitor,
  PanelTop,
  Play,
  RefreshCw,
  Square,
  Smartphone,
  Tablet,
  TerminalSquare,
  X
} from 'lucide-react';
import { useStudio } from '../lib/store';
import type { DevServerStatus } from '../lib/types';

type Viewport = 'responsive' | 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: Array<{ id: Viewport; label: string; icon: typeof Monitor }> = [
  { id: 'responsive', label: 'Fill panel', icon: PanelTop },
  { id: 'desktop', label: 'Desktop · 1180px', icon: Monitor },
  { id: 'tablet', label: 'Tablet · 820px', icon: Tablet },
  { id: 'mobile', label: 'Mobile · 390px', icon: Smartphone }
];

const EMPTY_DEV: DevServerStatus = { running: false, root: null, url: null, command: null, logs: [] };

export function PreviewPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const root = useStudio(state => state.root);
  const files = useStudio(state => state.files);
  const patch = useStudio(state => state.patch);
  const showToast = useStudio(state => state.showToast);
  const log = useStudio(state => state.log);


  const [tab, setTab] = useState<'static' | 'dev'>('static');
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [entry, setEntry] = useState('index.html');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [viewport, setViewport] = useState<Viewport>('responsive');
  const [viewportOpen, setViewportOpen] = useState(false);
  const [dev, setDev] = useState<DevServerStatus>(EMPTY_DEV);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const logsEnd = useRef<HTMLDivElement>(null);

  const htmlFiles = useMemo(
    () => files.filter(file => file.type === 'file' && /\.html?$/i.test(file.path)),
    [files]
  );

  useEffect(() => {
    let cancelled = false;
    void window.studio
      .previewStatus()
      .then(status => {
        if (cancelled || !status.url || status.root !== root) return;
        setBaseUrl(status.url);
        setUrl(status.url);
        setTab('static');
      })
      .catch(() => undefined);
    void window.studio
      .devStatus()
      .then(status => {
        if (cancelled) return;
        setDev(status);
        setLogs(status.logs);
        if (status.running && status.url && status.root === root) {
          setUrl(status.url);
          setTab('dev');
        }
      })
      .catch(() => undefined);
    const off = window.studio.onDevOutput(payload => {
      setLogs(current => [...current.slice(-240), payload.chunk]);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [root]);

  useEffect(() => {
    setBaseUrl(null);
    setUrl(null);
    setError(null);
    setEntry('index.html');
    setLogs([]);
    setDev(EMPTY_DEV);
  }, [root]);

  useEffect(() => {
    if (!logsOpen) return;
    logsEnd.current?.scrollIntoView({ block: 'end' });
  }, [logs, logsOpen]);

  useEffect(() => {
    if (!viewportOpen) return;
    const close = () => setViewportOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [viewportOpen]);

  const withEntry = (base: string, file: string) => {
    if (!file || file === 'index.html') return base;
    return base.replace(/\/?$/, '/') + file.replace(/^\/+/, '');
  };

  const startStatic = async () => {
    if (!root) return;
    setLoading('static');
    setError(null);
    try {
      const nextBase = await window.studio.startStaticPreview(root);
      setBaseUrl(nextBase);
      setUrl(withEntry(nextBase, entry));
      setTab('static');
      log('Static preview started at ' + nextBase, 'success');
    } catch (reason) {
      setError(String(reason));
      showToast({ kind: 'error', title: 'Static preview failed', message: String(reason) });
    } finally {
      setLoading(null);
    }
  };

  const startDev = async () => {
    if (!root) return;
    setLoading('dev');
    setError(null);
    try {
      const result = await window.studio.startDevServer(root);
      setUrl(result.url);
      setTab('dev');
      const status = await window.studio.devStatus();
      setDev(status);
      log(`Dev server started with “${result.command}”`, 'success');
    } catch (reason) {
      setError(String(reason));
      showToast({ kind: 'error', title: 'Dev server failed to start', message: String(reason) });
      setLogsOpen(true);
    } finally {
      setLoading(null);
    }
  };

  const stop = async () => {
    setLoading('stop');
    setError(null);
    try {
      if (tab === 'dev') {
        await window.studio.stopDevServer();
        setDev(EMPTY_DEV);
        setUrl(null);
        log('Dev server stopped', 'info');
      } else {
        await window.studio.stopStaticPreview();
        setBaseUrl(null);
        setUrl(null);
        log('Static preview stopped', 'info');
      }
    } catch (reason) {
      showToast({ kind: 'error', title: 'Could not stop preview', message: String(reason) });
    } finally {
      setLoading(null);
    }
  };

  const refresh = () => {
    if (!url) return;
    setNonce(value => value + 1);
  };

  const copyUrl = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => showToast({ kind: 'success', title: 'Preview URL copied' }));
  };

  const selectEntry = (file: string) => {
    setEntry(file);
    if (baseUrl) setUrl(withEntry(baseUrl, file));
    setNonce(value => value + 1);
  };

  if (!root) {
    return (
      <div className="preview-panel preview-empty">
        <span className="feature-icon green large">
          <Globe2 size={22} />
        </span>
        <h2>Preview real output</h2>
        <p>Open a project to run the static server or a managed dev server, then inspect it inside the studio.</p>
        <button type="button" className="btn secondary" onClick={onOpenSettings}>
          Configure the workspace
        </button>
      </div>
    );
  }

  const running = Boolean(url);
  const frameWidth = viewport === 'desktop' ? 1180 : viewport === 'tablet' ? 820 : viewport === 'mobile' ? 390 : 0;

  return (
    <div className="preview-panel">
      <div className="preview-head">
        <div className="preview-mode-tabs">
          <button
            type="button"
            className={'preview-mode ' + (tab === 'static' ? 'active' : '')}
            onClick={() => {
              setTab('static');
              if (baseUrl) setUrl(withEntry(baseUrl, entry));
              else setUrl(null);
            }}
          >
            <Globe2 size={13} /> Static
          </button>
          <button
            type="button"
            className={'preview-mode ' + (tab === 'dev' ? 'active' : '')}
            onClick={() => {
              setTab('dev');
              setUrl(dev.running ? dev.url : null);
            }}
          >
            <TerminalSquare size={13} /> Dev server
          </button>
        </div>
        <div className="preview-head-actions">
          {running && (
            <>
              <button type="button" className="icon-btn" title="Reload preview" onClick={refresh}>
                <RefreshCw size={13} />
              </button>
              <button type="button" className="icon-btn" title="Copy URL" onClick={copyUrl}>
                <Copy size={13} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Open in browser"
                onClick={() => url && void window.studio.openExternal(url)}
              >
                <ExternalLink size={13} />
              </button>
            </>
          )}
          {url ? (
            <button type="button" className="btn secondary tiny" onClick={() => void stop()} disabled={loading === 'stop'}>
              {loading === 'stop' ? <Loader2 size={12} className="spin" /> : <Square size={11} />} Stop
            </button>
          ) : tab === 'dev' ? (
            <button type="button" className="btn primary tiny" onClick={() => void startDev()} disabled={Boolean(loading)}>
              {loading === 'dev' ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Start dev
            </button>
          ) : (
            <button type="button" className="btn primary tiny" onClick={() => void startStatic()} disabled={Boolean(loading)}>
              {loading === 'static' ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Start preview
            </button>
          )}
          <button type="button" className="icon-btn" title="Close preview" onClick={() => patch({ rightOpen: false })}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="preview-toolbar">
        {tab === 'static' ? (
          <label className="preview-entry">
            <FileCode2 size={12} />
            <select value={entry} onChange={event => selectEntry(event.target.value)}>
              {(htmlFiles.length ? htmlFiles : [{ path: 'index.html', name: 'index.html' } as const]).map(file => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
            <ChevronDown size={11} />
          </label>
        ) : (
          <span className="preview-command" title={dev.command || 'No dev command detected'}>
            <TerminalSquare size={11} /> {dev.command || (url ? 'dev server' : 'no command detected')}
          </span>
        )}

        <span className="preview-spacer" />

        <div className="viewport-wrap" onMouseDown={event => event.stopPropagation()}>
          <button type="button" className="icon-btn" title="Viewport size" onClick={() => setViewportOpen(value => !value)}>
            {viewport === 'mobile' ? <Smartphone size={14} /> : viewport === 'tablet' ? <Tablet size={14} /> : <Monitor size={14} />}
          </button>
          {viewportOpen && (
            <div className="viewport-pop">
              {VIEWPORTS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={'viewport-row ' + (viewport === item.id ? 'active' : '')}
                    onClick={() => {
                      setViewport(item.id);
                      setViewportOpen(false);
                    }}
                  >
                    <Icon size={13} /> {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className={'icon-btn ' + (logsOpen ? 'active' : '')}
          title="Dev server output"
          onClick={() => setLogsOpen(value => !value)}
        >
          <TerminalSquare size={14} />
          {logs.length > 0 && <span className="icon-dot" />}
        </button>
      </div>

      {error && (
        <div className="preview-error">
          <span>{error}</span>
          <button type="button" className="icon-btn tiny" onClick={() => setError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      <div className="preview-stage">
        {url ? (
          <div className="preview-frame-shell" style={frameWidth ? { width: frameWidth } : undefined}>
            <div className="preview-frame-bar">
              <span className="traffic-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="preview-url" title={url}>
                {url}
              </span>
              <button
                type="button"
                className="icon-btn tiny"
                title="Open in browser"
                onClick={() => void window.studio.openExternal(url)}
              >
                <ArrowUpRight size={12} />
              </button>
            </div>
            <iframe
              key={url + ':' + nonce}
              src={url}
              title="Project preview"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
            />
          </div>
        ) : (
          <div className="preview-placeholder">
            <span className="preview-placeholder-grid" />
            <span className="feature-icon green large">
              {tab === 'dev' ? <TerminalSquare size={22} /> : <Globe2 size={22} />}
            </span>
            <h3>{tab === 'dev' ? 'Managed dev server' : 'Static preview server'}</h3>
            <p>
              {tab === 'dev'
                ? 'Runs the project’s dev or start script through your package manager. Output streams into the panel.'
                : 'Serves the project from 127.0.0.1 on a random local port. Secret files and dependency folders are blocked.'}
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => void (tab === 'dev' ? startDev() : startStatic())}
              disabled={Boolean(loading)}
            >
              {loading ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              {tab === 'dev' ? 'Start dev server' : 'Start static preview'}
            </button>
            {tab === 'dev' && (
              <small>
                Detects npm, pnpm, yarn or bun from the lockfile. Stop it any time with the Stop button.
              </small>
            )}
          </div>
        )}
      </div>

      {logsOpen && (
        <div className="preview-logs">
          <div className="preview-logs-head">
            <span>
              <TerminalSquare size={12} /> DEV OUTPUT
            </span>
            <div>
              <button type="button" className="icon-btn tiny" title="Clear output" onClick={() => setLogs([])}>
                <X size={11} />
              </button>
            </div>
          </div>
          <pre>
            {logs.length
              ? logs.join('')
              : tab === 'dev'
                ? 'Start the dev server to stream its output here.'
                : 'Static preview does not produce server output.'}
            <span ref={logsEnd} />
          </pre>
        </div>
      )}
    </div>
  );
}
