import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Circle,
  CircleStop,
  Eraser,
  Loader2,
  Play,
  TerminalSquare,
  X
} from 'lucide-react';
import { useStudio, type LogKind, type TerminalLine } from '../lib/store';
import { formatTime, uid } from '../lib/utils';

const LOG_TONE: Record<LogKind, string> = {
  info: 'info',
  success: 'success',
  error: 'error',
  warning: 'warning',
  agent: 'agent',
  git: 'git'
};

const QUICK_COMMANDS = ['npm install', 'npm run build', 'npm run dev', 'npm test', 'git status'];

export function BottomPanel() {
  const root = useStudio(state => state.root);
  const terminal = useStudio(state => state.terminal);
  const logs = useStudio(state => state.logs);
  const bottomTab = useStudio(state => state.bottomTab);
  const patch = useStudio(state => state.patch);
  const appendTerminal = useStudio(state => state.appendTerminal);
  const clearTerminal = useStudio(state => state.clearTerminal);
  const clearLogs = useStudio(state => state.clearLogs);
  const showToast = useStudio(state => state.showToast);

  const [command, setCommand] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = window.studio.onCommandOutput(payload => {
      appendTerminal(payload.chunk);
    });
    return off;
  }, [appendTerminal]);

  useEffect(() => {
    if (bottomTab !== 'terminal') return;
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [terminal, bottomTab]);

  useEffect(() => {
    if (bottomTab !== 'activity') return;
    logEnd.current?.scrollIntoView({ block: 'end' });
  }, [logs, bottomTab]);

  const run = async (raw?: string) => {
    const value = (raw ?? command).trim();
    if (!root) {
      showToast({ kind: 'warning', title: 'Open a project first' });
      return;
    }
    if (!value || runningId) return;
    const requestId = uid();
    setRunningId(requestId);
    setCommand('');
    setHistory(current => [value, ...current.filter(item => item !== value)].slice(0, 25));
    setHistoryIndex(-1);
    appendTerminal(`PS ${root}> ${value}`, 'input');
    try {
      const result = await window.studio.runCommand(root, value, requestId);
      appendTerminal(
        result.timedOut ? `\nCommand timed out after 180 seconds.` : `\nProcess exited with code ${result.code ?? 'unknown'}.`,
        result.code === 0 && !result.timedOut ? 'success' : 'error'
      );
    } catch (error) {
      appendTerminal(String(error), 'error');
    } finally {
      setRunningId(null);
    }
  };

  const stop = () => {
    if (!runningId) return;
    void window.studio.stopCommand(runningId).then(stopped => {
      if (stopped) appendTerminal('\nProcess tree stopped by user.', 'info');
    });
  };

  const errors = useMemo(() => logs.filter(entry => entry.kind === 'error').length, [logs]);

  return (
    <section className="bottom-panel">
      <div className="bottom-head">
        <div className="bottom-tabs">
          <button
            type="button"
            className={'bottom-tab ' + (bottomTab === 'terminal' ? 'active' : '')}
            onClick={() => patch({ bottomTab: 'terminal' })}
          >
            <TerminalSquare size={13} /> Terminal
            {terminal.length > 0 && <span className="bottom-count">{terminal.length}</span>}
          </button>
          <button
            type="button"
            className={'bottom-tab ' + (bottomTab === 'activity' ? 'active' : '')}
            onClick={() => patch({ bottomTab: 'activity' })}
          >
            <Activity size={13} /> Activity
            {logs.length > 0 && <span className="bottom-count">{logs.length}</span>}
            {errors > 0 && <span className="bottom-error-dot" />}
          </button>
        </div>
        <div className="bottom-actions">
          {bottomTab === 'terminal' && runningId && (
            <button type="button" className="btn secondary tiny" onClick={stop}>
              <CircleStop size={12} /> Stop
            </button>
          )}
          {bottomTab === 'terminal' ? (
            <button type="button" className="icon-btn" title="Clear terminal" onClick={clearTerminal}>
              <Eraser size={13} />
            </button>
          ) : (
            <button type="button" className="icon-btn" title="Clear activity" onClick={clearLogs}>
              <Eraser size={13} />
            </button>
          )}
          <button type="button" className="icon-btn" title="Close panel" onClick={() => patch({ bottomOpen: false })}>
            <X size={14} />
          </button>
        </div>
      </div>

      {bottomTab === 'terminal' ? (
        <>
          <div className="terminal-scroller" ref={scroller}>
            {terminal.length === 0 && (
              <div className="terminal-empty">
                <TerminalSquare size={18} />
                <span>Run a command in the project. Commands ask for approval before executing.</span>
              </div>
            )}
            {terminal.map(line => (
              <TerminalRow key={line.id} line={line} />
            ))}
            {runningId && (
              <div className="terminal-running">
                <Loader2 size={11} className="spin" /> Running…
              </div>
            )}
          </div>
          <form
            className="terminal-input-row"
            onSubmit={event => {
              event.preventDefault();
              void run();
            }}
          >
            <span className={'terminal-prompt-icon ' + (runningId ? 'busy' : '')}>
              {runningId ? <Loader2 size={12} className="spin" /> : <ChevronRight size={13} />}
            </span>
            <input
              value={command}
              placeholder="Run a PowerShell command…"
              onChange={event => setCommand(event.target.value)}
              disabled={Boolean(runningId)}
              onKeyDown={event => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  const next = Math.min(history.length - 1, historyIndex + 1);
                  if (next >= 0) {
                    setHistoryIndex(next);
                    setCommand(history[next]);
                  }
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  const next = historyIndex - 1;
                  setHistoryIndex(next);
                  setCommand(next >= 0 ? history[next] : '');
                }
              }}
            />
            <div className="terminal-quick">
              {QUICK_COMMANDS.slice(0, 3).map(item => (
                <button type="button" key={item} onClick={() => void run(item)} disabled={Boolean(runningId)}>
                  {item.replace('npm run ', '')}
                </button>
              ))}
            </div>
            <button type="submit" className="terminal-send" disabled={!command.trim() || Boolean(runningId)}>
              {runningId ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
            </button>
          </form>
        </>
      ) : (
        <div className="activity-scroller">
          {logs.length === 0 && (
            <div className="terminal-empty">
              <Activity size={18} />
              <span>Agent activity, approvals, Git operations and errors appear here.</span>
            </div>
          )}
          {logs.map(entry => (
            <div className={'activity-row tone-' + LOG_TONE[entry.kind]} key={entry.id}>
              <Circle size={7} className="activity-dot" />
              <span className="activity-time">{formatTime(entry.at)}</span>
              <span className="activity-kind">{entry.kind}</span>
              <span className="activity-message">{entry.message}</span>
            </div>
          ))}
          <div ref={logEnd} />
        </div>
      )}
    </section>
  );
}

function TerminalRow({ line }: { line: TerminalLine }) {
  return (
    <div className={'terminal-line ' + line.kind}>
      {line.text.split('\n').map((part, index) => (
        <span key={index}>{part || '\u00a0'}</span>
      ))}
    </div>
  );
}
