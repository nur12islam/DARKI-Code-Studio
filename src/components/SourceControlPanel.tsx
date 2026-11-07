import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileDiff,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Loader2,
  Plus,
  RefreshCw,
  Upload
} from 'lucide-react';
import { useStudio } from '../lib/store';
import { baseName } from '../lib/utils';

type Props = {
  onRefresh: () => Promise<void>;
  onOpenFile: (path: string) => void;
  onShowDiff: (path?: string) => void;
  onOpenGithub: () => void;
};

const STATE_LABEL: Record<string, string> = {
  modified: 'M',
  staged: 'S',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  renamed: 'R',
  conflict: '!',
  changed: 'C'
};

export function SourceControlPanel({ onRefresh, onOpenFile, onShowDiff, onOpenGithub }: Props) {
  const root = useStudio(state => state.root);
  const git = useStudio(state => state.git);
  const gitLoading = useStudio(state => state.gitLoading);
  const settings = useStudio(state => state.settings);
  const patch = useStudio(state => state.patch);
  const showToast = useStudio(state => state.showToast);
  const askPrompt = useStudio(state => state.askPrompt);
  const askConfirm = useStudio(state => state.askConfirm);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ current: string; local: string[]; remote: string[] } | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);

  useEffect(() => {
    if (!root) {
      setBranches(null);
      return;
    }
    void window.studio
      .gitBranches(root)
      .then(setBranches)
      .catch(() => setBranches(null));
  }, [root, git?.branch]);

  const run = async (label: string, task: () => Promise<string | void>, successTitle: string) => {
    if (busy) return;
    setBusy(label);
    try {
      const result = await task();
      showToast({ kind: 'success', title: successTitle, message: result || undefined });
      await onRefresh();
    } catch (error) {
      showToast({ kind: 'error', title: successTitle + ' failed', message: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const commit = (push: boolean) => {
    if (!root || !message.trim()) {
      showToast({ kind: 'warning', title: 'Add a commit message' });
      return;
    }
    void run(
      push ? 'commit-push' : 'commit',
      async () => {
        const result = await window.studio.gitCommit(root, message.trim());
        setMessage('');
        if (push) return (await window.studio.gitPush(root)) + ' ' + result.summary;
        return `${result.summary} · ${result.commit.slice(0, 7)}`;
      },
      push ? 'Committed & pushed' : 'Commit created'
    );
  };

  const init = () =>
    run(
      'init',
      async () => {
        if (!root) return;
        return window.studio.gitInit(root);
      },
      'Git initialized'
    );

  const createBranch = async () => {
    if (!root) return;
    const name = await askPrompt({
      title: 'Create a branch',
      message: 'The current branch will be used as the starting point.',
      label: 'Branch name',
      placeholder: 'feature/my-change',
      confirmLabel: 'Create branch'
    });
    if (!name) return;
    await run('branch', () => window.studio.gitCreateBranch(root, name), 'Branch created');
  };

  const switchBranch = async (branch: string) => {
    if (!root) return;
    setBranchOpen(false);
    if (branch === git?.branch) return;
    if (!git?.clean) {
      const ok = await askConfirm({
        title: 'Switch branches?',
        message: 'You have uncommitted changes. Git requires a clean working tree before switching branches. Commit or stash first.',
        confirmLabel: 'Try switching'
      });
      if (!ok) return;
    }
    await run('switch', () => window.studio.gitCheckout(root, branch), 'Branch switched');
  };

  if (!root) {
    return (
      <div className="side-panel source-panel">
        <div className="side-head">
          <div>
            <span className="eyebrow">VERSION CONTROL</span>
            <h2>Source Control</h2>
          </div>
        </div>
        <div className="side-empty tall">
          <GitBranch size={26} />
          <p>Open a project folder to see its Git status.</p>
        </div>
      </div>
    );
  }

  if (!git?.isRepo) {
    return (
      <div className="side-panel source-panel">
        <div className="side-head">
          <div>
            <span className="eyebrow">VERSION CONTROL</span>
            <h2>Source Control</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => void onRefresh()} title="Refresh">
            <RefreshCw size={13} className={gitLoading ? 'spin' : ''} />
          </button>
        </div>
        <div className="side-empty tall">
          <GitBranch size={26} />
          <p>This folder is not a Git repository yet.</p>
          <button type="button" className="btn primary" onClick={() => void init()} disabled={Boolean(busy)}>
            {busy === 'init' ? <Loader2 size={14} className="spin" /> : <GitBranch size={14} />} Initialize Git
          </button>
          <button type="button" className="btn secondary" onClick={onOpenGithub}>
            <GitPullRequest size={14} /> Publish to GitHub
          </button>
        </div>
      </div>
    );
  }

  const changes = git.files;
  const canCommit = changes.length > 0 && Boolean(message.trim()) && !busy;

  return (
    <div className="side-panel source-panel">
      <div className="side-head">
        <div>
          <span className="eyebrow">VERSION CONTROL</span>
          <h2>Source Control</h2>
        </div>
        <div className="side-head-actions">
          <button type="button" className="icon-btn" onClick={() => void onRefresh()} title="Refresh status">
            <RefreshCw size={13} className={gitLoading ? 'spin' : ''} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void createBranch()} title="Create branch">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="branch-card">
        <button type="button" className="branch-main" onClick={() => setBranchOpen(value => !value)}>
          <GitBranch size={14} />
          <strong>{git.branch}</strong>
          <ChevronDown size={13} className={branchOpen ? 'rotated' : ''} />
        </button>
        <div className="branch-stats">
          <span className={git.ahead ? 'ahead' : ''}>↑{git.ahead}</span>
          <span className={git.behind ? 'behind' : ''}>↓{git.behind}</span>
          <span className="branch-clean">{git.clean ? 'clean' : `${changes.length} changed`}</span>
        </div>
        {branchOpen && (
          <div className="branch-pop">
            <span className="eyebrow">LOCAL BRANCHES</span>
            {(branches?.local || [git.branch]).map(branch => (
              <button
                type="button"
                key={branch}
                className={'branch-row ' + (branch === git.branch ? 'active' : '')}
                onClick={() => void switchBranch(branch)}
              >
                <GitBranch size={12} />
                {branch}
                {branch === git.branch && <CircleDot size={11} />}
              </button>
            ))}
            {Boolean(branches?.remote.length) && <span className="eyebrow">REMOTE</span>}
            {branches?.remote.map(branch => (
              <button
                type="button"
                key={branch}
                className="branch-row remote"
                onClick={() => void switchBranch(branch.replace(/^origin\//, ''))}
              >
                <GitBranch size={12} /> {branch}
              </button>
            ))}
          </div>
        )}
      </div>

      {git.remoteUrl && (
        <button type="button" className="remote-row" onClick={onOpenGithub} title={git.remoteUrl}>
          <GitPullRequest size={12} />
          <span>{git.remoteUrl.replace(/^https?:\/\//, '')}</span>
          <ChevronRight size={11} />
        </button>
      )}

      <div className="commit-box">
        <textarea
          value={message}
          onChange={event => setMessage(event.target.value)}
          placeholder="Commit message (Ctrl+Enter to commit)"
          rows={3}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              commit(false);
            }
          }}
        />
        <div className="commit-actions">
          <button type="button" className="btn primary" disabled={!canCommit} onClick={() => commit(false)}>
            {busy === 'commit' ? <Loader2 size={13} className="spin" /> : <GitCommit size={13} />} Commit
          </button>
          <button type="button" className="btn secondary" disabled={!canCommit} onClick={() => commit(true)}>
            {busy === 'commit-push' ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Commit &amp; Push
          </button>
        </div>
        {!message.trim() && changes.length > 0 && (
          <button type="button" className="suggest-message" onClick={() => setMessage(suggestMessage(changes.map(change => change.path)))}>
            Use suggested message
          </button>
        )}
      </div>

      <div className="changes-head">
        <span className="eyebrow">CHANGES</span>
        <span>{changes.length}</span>
        <div className="changes-actions">
          <button type="button" className="icon-btn tiny" title="Pull" onClick={() => void run('pull', () => window.studio.gitPull(root), 'Pulled')}>
            {busy === 'pull' ? <Loader2 size={12} className="spin" /> : <ArrowDownToLine size={13} />}
          </button>
          <button type="button" className="icon-btn tiny" title="Push" onClick={() => void run('push', () => window.studio.gitPush(root), 'Pushed')}>
            {busy === 'push' ? <Loader2 size={12} className="spin" /> : <ArrowUpFromLine size={13} />}
          </button>
        </div>
      </div>

      <div className="change-list">
        {changes.map(change => (
          <div className="change-row" key={change.path}>
            <span className={'change-state state-' + change.state}>{STATE_LABEL[change.state] || 'M'}</span>
            <button type="button" className="change-path" onClick={() => onOpenFile(change.path)} title={change.path}>
              <strong>{baseName(change.path)}</strong>
              <small>{change.path.includes('/') ? change.path.slice(0, change.path.lastIndexOf('/')) : ''}</small>
            </button>
            <button type="button" className="icon-btn tiny" title="View diff" onClick={() => onShowDiff(change.path)}>
              <FileDiff size={12} />
            </button>
          </div>
        ))}
        {!changes.length && (
          <div className="side-empty compact">
            <CircleDot size={18} />
            <p>Working tree clean.</p>
            <button type="button" className="btn ghost tiny" onClick={() => void run('pull', () => window.studio.gitPull(root), 'Pulled')}>
              Pull latest
            </button>
          </div>
        )}
      </div>

      <div className="git-foot">
        <button type="button" className="btn ghost tiny" onClick={() => void run('pull', () => window.studio.gitPull(root), 'Pulled')}>
          <ArrowDownToLine size={12} /> Pull
        </button>
        <button type="button" className="btn ghost tiny" onClick={() => void run('push', () => window.studio.gitPush(root), 'Pushed')}>
          <ArrowUpFromLine size={12} /> Push
        </button>
        <button type="button" className="btn ghost tiny" onClick={() => onShowDiff()}>
          <FileDiff size={12} /> All diffs
        </button>
        {settings?.hasGithubToken && (
          <span className="git-auth-ok" title="Saved GitHub token will be used for HTTPS pushes">
            token saved
          </span>
        )}
      </div>
    </div>
  );
}

function suggestMessage(paths: string[]) {
  const has = (pattern: RegExp) => paths.some(path => pattern.test(path));
  if (has(/\.(css|scss|less)$/)) return 'Refresh interface styling';
  if (has(/\.(tsx|jsx)$/)) return 'Update interface components';
  if (has(/\.(ts|js)$/)) return 'Update application logic';
  if (has(/\.md$/)) return 'Update documentation';
  if (has(/package\.json/)) return 'Update project dependencies';
  return 'Apply project changes';
}
