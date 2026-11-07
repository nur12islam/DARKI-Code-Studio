import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  FileDiff,
  GitBranch,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  X
} from 'lucide-react';
import { useStudio } from '../lib/store';
import { diffLines } from '../lib/diff';
import type { ApprovalRequest } from '../lib/types';

const KIND_META: Record<
  ApprovalRequest['kind'],
  { label: string; icon: typeof ShieldCheck; tone: string }
> = {
  write: { label: 'File change', icon: FileDiff, tone: 'cyan' },
  delete: { label: 'Deletion', icon: Trash2, tone: 'red' },
  command: { label: 'Command', icon: Terminal, tone: 'amber' },
  git: { label: 'Git action', icon: GitBranch, tone: 'violet' },
  network: { label: 'Network access', icon: ShieldAlert, tone: 'amber' }
};

export function ApprovalModal() {
  const approvals = useStudio(state => state.approvals);
  const removeApproval = useStudio(state => state.removeApproval);
  const log = useStudio(state => state.log);
  const showToast = useStudio(state => state.showToast);
  const [busy, setBusy] = useState(false);
  const request = approvals[0];

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) void respond(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const diff = useMemo(() => {
    if (!request || request.kind !== 'write' || typeof request.after !== 'string') return null;
    return diffLines(request.before ?? '', request.after);
  }, [request]);

  if (!request) return null;
  const meta = KIND_META[request.kind] || KIND_META.write;
  const Icon = meta.icon;

  async function respond(approved: boolean) {
    if (!request || busy) return;
    setBusy(true);
    try {
      await window.studio.respondApproval(request.id, approved);
      removeApproval(request.id);
      log((approved ? 'Allowed: ' : 'Denied: ') + request.title, approved ? 'success' : 'warning');
      showToast({
        kind: approved ? 'success' : 'warning',
        title: approved ? 'Action approved' : 'Action denied',
        message: request.title
      });
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not answer approval', message: String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop approval-backdrop">
      <div className="approval-modal" role="dialog" aria-modal="true">
        <div className="approval-head">
          <span className={'approval-kind tone-' + meta.tone}>
            <Icon size={17} />
          </span>
          <div className="approval-title">
            <span className="eyebrow">AGENT PAUSED · {meta.label.toUpperCase()}</span>
            <h2>{request.title}</h2>
          </div>
          <span className="approval-count">
            {approvals.length} pending
          </span>
        </div>

        <p className="approval-copy">
          The agent is waiting for your decision. Review the exact action below. Nothing has been applied yet.
        </p>

        <div className="approval-detail">
          <span className="approval-detail-label">Target</span>
          <code>{request.path || request.meta || request.detail}</code>
        </div>

        {request.kind === 'command' && (
          <div className="command-preview">
            <span className="terminal-prompt">PS ›</span>
            <pre>{request.detail}</pre>
          </div>
        )}

        {request.kind === 'git' && request.meta && (
          <div className="approval-detail">
            <span className="approval-detail-label">Changed files</span>
            <pre className="approval-file-list">{request.meta}</pre>
          </div>
        )}

        {diff && (
          <div className="diff-panel">
            <div className="diff-head">
              <span>
                <FileDiff size={14} /> Proposed diff
              </span>
              <span className="diff-stats">
                <b className="add">+{diff.additions}</b>
                <b className="del">−{diff.deletions}</b>
                {diff.truncated && <em>truncated</em>}
              </span>
            </div>
            <div className="diff-body">
              {diff.lines.map((line, index) => (
                <div className={'diff-line ' + line.type} key={index}>
                  <span className="diff-gutter">{line.oldLine ?? ''}</span>
                  <span className="diff-gutter">{line.newLine ?? ''}</span>
                  <span className="diff-sign">{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}</span>
                  <code>{line.text || ' '}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {request.kind === 'delete' && typeof request.before === 'string' && (
          <div className="deleted-preview">
            <span className="approval-detail-label">File contents being deleted (first 80 lines)</span>
            <pre>{request.before.split('\n').slice(0, 80).join('\n')}</pre>
          </div>
        )}

        <div className="approval-warning">
          <ShieldAlert size={16} />
          <span>
            Only allow actions you understand. Commands can modify files or access the network. Approval expires
            automatically after three minutes.
          </span>
        </div>

        <div className="approval-actions">
          <button type="button" className="btn ghost" onClick={() => void respond(false)} disabled={busy}>
            <X size={14} /> Deny
          </button>
          <button type="button" className="btn primary" onClick={() => void respond(true)} disabled={busy}>
            {busy ? <span className="spinner" /> : <Check size={14} />} Allow action
          </button>
        </div>

        {approvals.length > 1 && (
          <div className="approval-queue-note">
            <ShieldCheck size={13} /> {approvals.length - 1} more action{approvals.length - 1 === 1 ? '' : 's'} waiting
            <ChevronRight size={13} />
          </div>
        )}
      </div>
    </div>
  );
}
