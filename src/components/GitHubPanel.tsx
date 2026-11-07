import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  GitFork,
  Github,
  GitPullRequest,
  Globe2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';
import { useStudio } from '../lib/store';
import type { GithubRepo, GithubUser } from '../lib/types';
import { formatRelative, projectName, repoFromRemote } from '../lib/utils';

type Props = {
  onOpenSettings: () => void;
  onOpenWorkspace: (root: string) => Promise<void>;
  onRefreshGit: () => Promise<void>;
};

type PullRequest = { number: number; title: string; state: string; html_url: string; user?: { login?: string } };

export function GitHubPanel({ onOpenSettings, onOpenWorkspace, onRefreshGit }: Props) {
  const root = useStudio(state => state.root);
  const git = useStudio(state => state.git);
  const settings = useStudio(state => state.settings);
  const showToast = useStudio(state => state.showToast);
  const log = useStudio(state => state.log);

  const [user, setUser] = useState<GithubUser | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [publishName, setPublishName] = useState(root ? projectName(root).toLowerCase().replace(/[^a-z0-9._-]+/g, '-') : '');
  const [publishDescription, setPublishDescription] = useState('');
  const [privateRepo, setPrivateRepo] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [prTitle, setPrTitle] = useState('');
  const [prHead, setPrHead] = useState(git?.branch || '');
  const [prBase, setPrBase] = useState('main');
  const [prBody, setPrBody] = useState('');
  const [creatingPr, setCreatingPr] = useState(false);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [prLoading, setPrLoading] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);

  const remoteRepo = useMemo(() => repoFromRemote(git?.remoteUrl || null), [git?.remoteUrl]);
  const connected = Boolean(settings?.hasGithubToken);

  useEffect(() => {
    if (root) {
      setPublishName(projectName(root).toLowerCase().replace(/[^a-z0-9._-]+/g, '-'));
      setPrHead(git?.branch || '');
    }
  }, [root, git?.branch]);

  useEffect(() => {
    if (!connected) {
      setUser(null);
      setRepos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void window.studio
      .githubVerify()
      .then(async nextUser => {
        if (cancelled) return;
        setUser(nextUser);
        const list = await window.studio.githubRepos();
        if (!cancelled) setRepos(list);
      })
      .catch(reason => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  useEffect(() => {
    if (!connected || !remoteRepo) {
      setPrs([]);
      return;
    }
    let cancelled = false;
    setPrLoading(true);
    void window.studio
      .githubPullRequests(remoteRepo.owner, remoteRepo.repo)
      .then(list => {
        if (!cancelled) setPrs(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, remoteRepo?.owner, remoteRepo?.repo]);

  const refresh = async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const nextUser = await window.studio.githubVerify();
      setUser(nextUser);
      setRepos(await window.studio.githubRepos());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };

  const publish = async () => {
    if (!publishName.trim()) {
      showToast({ kind: 'warning', title: 'Enter a repository name' });
      return;
    }
    setPublishing(true);
    try {
      const result = await window.studio.githubCreate({
        root: root || null,
        name: publishName.trim(),
        description: publishDescription.trim() || undefined,
        private: privateRepo
      });
      log(result.message, result.published ? 'success' : 'warning');
      showToast({
        kind: result.published ? 'success' : 'warning',
        title: result.message,
        message: result.detail
      });
      if (result.repoUrl) void window.studio.openExternal(result.repoUrl);
      await onRefreshGit();
      await refresh();
    } catch (reason) {
      showToast({ kind: 'error', title: 'Could not publish repository', message: String(reason) });
    } finally {
      setPublishing(false);
    }
  };

  const createPullRequest = async () => {
    if (!remoteRepo) return;
    if (!prTitle.trim()) {
      showToast({ kind: 'warning', title: 'Add a pull request title' });
      return;
    }
    setCreatingPr(true);
    try {
      const url = await window.studio.githubPullRequest({
        owner: remoteRepo.owner,
        repo: remoteRepo.repo,
        title: prTitle.trim(),
        head: prHead.trim(),
        base: prBase.trim() || 'main',
        body: prBody.trim() || undefined
      });
      showToast({ kind: 'success', title: 'Pull request created', message: url });
      setPrTitle('');
      setPrBody('');
      if (/^https?:\/\//.test(url)) void window.studio.openExternal(url);
      const list = await window.studio.githubPullRequests(remoteRepo.owner, remoteRepo.repo);
      setPrs(list);
    } catch (reason) {
      showToast({ kind: 'error', title: 'Could not create pull request', message: String(reason) });
    } finally {
      setCreatingPr(false);
    }
  };

  const clone = async (repo: GithubRepo) => {
    setCloning(repo.fullName);
    try {
      const folder = await window.studio.cloneProject(repo.cloneUrl);
      if (folder) {
        await onOpenWorkspace(folder);
        showToast({ kind: 'success', title: 'Repository cloned', message: folder });
      }
    } catch (reason) {
      showToast({ kind: 'error', title: 'Clone failed', message: String(reason) });
    } finally {
      setCloning(null);
    }
  };

  const filteredRepos = repos.filter(repo =>
    (repo.fullName + ' ' + (repo.defaultBranch || '')).toLowerCase().includes(query.trim().toLowerCase())
  );

  if (!connected) {
    return (
      <div className="side-panel github-panel">
        <div className="side-head">
          <div>
            <span className="eyebrow">REMOTE &amp; COLLABORATION</span>
            <h2>GitHub</h2>
          </div>
        </div>
        <div className="github-connect">
          <span className="feature-icon violet large">
            <Github size={22} />
          </span>
          <h3>Connect GitHub</h3>
          <p>
            Add a personal access token to publish projects, clone repositories and open pull requests without leaving
            the studio.
          </p>
          <button type="button" className="btn primary" onClick={onOpenSettings}>
            <ShieldCheck size={14} /> Add a GitHub token
          </button>
          <div className="github-scopes">
            <span className="eyebrow">RECOMMENDED SCOPES</span>
            <div>
              <code>repo</code>
              <code>read:user</code>
              <code>pull_request</code>
            </div>
          </div>
          <p className="muted small">
            The token is stored with OS-backed encryption and is never exposed to the renderer or the agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel github-panel">
      <div className="side-head">
        <div>
          <span className="eyebrow">REMOTE &amp; COLLABORATION</span>
          <h2>GitHub</h2>
        </div>
        <button type="button" className="icon-btn" title="Refresh GitHub" onClick={() => void refresh()}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="github-user">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" />
        ) : (
          <span className="github-avatar">
            <Github size={17} />
          </span>
        )}
        <div>
          <strong>{user?.name || user?.login || settings?.githubLogin || 'GitHub account'}</strong>
          <small>
            @{user?.login || settings?.githubLogin || 'connected'} <Check size={10} />
          </small>
        </div>
        {user?.htmlUrl && (
          <button
            type="button"
            className="icon-btn tiny"
            title="Open GitHub profile"
            onClick={() => user.htmlUrl && void window.studio.openExternal(user.htmlUrl)}
          >
            <ArrowUpRight size={12} />
          </button>
        )}
      </div>

      {error && (
        <div className="inline-error">
          <span>{error}</span>
          <button type="button" className="btn ghost tiny" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {remoteRepo ? (
        <div className="github-remote">
          <span className="eyebrow">CURRENT REPOSITORY</span>
          <button
            type="button"
            className="github-remote-card"
            onClick={() => git?.remoteUrl && /^https?:\/\//.test(git.remoteUrl) && void window.studio.openExternal(git.remoteUrl.replace(/\.git$/, ''))}
          >
            <span>
              <strong>
                {remoteRepo.owner}/{remoteRepo.repo}
              </strong>
              <small>
                <CircleDot size={9} /> {git?.branch || 'detached'} · {git?.clean ? 'clean' : `${git?.files.length || 0} changed`}
              </small>
            </span>
            <ArrowUpRight size={13} />
          </button>
          <button
            type="button"
            className="btn secondary tiny full"
            onClick={() => git?.remoteUrl && void window.studio.openExternal(git.remoteUrl.replace(/\.git$/, ''))}
          >
            <Globe2 size={12} /> Open on GitHub
          </button>
        </div>
      ) : (
        <div className="github-publish">
          <span className="eyebrow">PUBLISH THIS PROJECT</span>
          <p className="muted small">
            {root
              ? 'Create a repository, set origin, commit any changes and push in one step.'
              : 'Open a project folder to publish it to GitHub.'}
          </p>
          <label className="field-label">Repository name</label>
          <input
            className="text-input"
            value={publishName}
            onChange={event => setPublishName(event.target.value)}
            placeholder="my-project"
            disabled={!root}
          />
          <label className="field-label">Description</label>
          <input
            className="text-input"
            value={publishDescription}
            onChange={event => setPublishDescription(event.target.value)}
            placeholder="Built with DARKI Code Studio"
            disabled={!root}
          />
          <label className="check-row">
            <input type="checkbox" checked={privateRepo} onChange={event => setPrivateRepo(event.target.checked)} />
            <Lock size={11} /> Private repository
          </label>
          <button
            type="button"
            className="btn primary full"
            onClick={() => void publish()}
            disabled={!root || publishing || !publishName.trim()}
          >
            {publishing ? <Loader2 size={14} className="spin" /> : <Rocket size={14} />} Publish repository
          </button>
        </div>
      )}

      {remoteRepo && (
        <div className="github-pr-section">
          <div className="github-section-head">
            <span className="eyebrow">PULL REQUESTS</span>
            {prLoading && <Loader2 size={11} className="spin" />}
          </div>
          <div className="github-pr-list">
            {prs.map(pr => (
              <button
                type="button"
                key={pr.number}
                className="github-pr-row"
                onClick={() => /^https?:\/\//.test(pr.html_url) && void window.studio.openExternal(pr.html_url)}
                title={pr.title}
              >
                <GitPullRequest size={12} />
                <span>
                  <strong>{pr.title}</strong>
                  <small>
                    #{pr.number} · {pr.user?.login || 'unknown'}
                  </small>
                </span>
                <ChevronRight size={11} />
              </button>
            ))}
            {!prLoading && !prs.length && <p className="muted small">No open pull requests.</p>}
          </div>

          <details className="github-pr-form">
            <summary>
              <Plus size={12} /> New pull request
            </summary>
            <label className="field-label">Title</label>
            <input className="text-input" value={prTitle} onChange={event => setPrTitle(event.target.value)} placeholder="Polish the landing page" />
            <div className="form-grid two">
              <div>
                <label className="field-label">Head branch</label>
                <input className="text-input" value={prHead} onChange={event => setPrHead(event.target.value)} />
              </div>
              <div>
                <label className="field-label">Base branch</label>
                <input className="text-input" value={prBase} onChange={event => setPrBase(event.target.value)} />
              </div>
            </div>
            <label className="field-label">Description</label>
            <textarea
              className="text-input"
              rows={3}
              value={prBody}
              onChange={event => setPrBody(event.target.value)}
              placeholder="What changed and why?"
            />
            <button type="button" className="btn primary full" onClick={() => void createPullRequest()} disabled={creatingPr}>
              {creatingPr ? <Loader2 size={13} className="spin" /> : <GitPullRequest size={13} />} Create pull request
            </button>
          </details>
        </div>
      )}

      <div className="github-repos-section">
        <div className="github-section-head">
          <span className="eyebrow">YOUR REPOSITORIES</span>
          <span className="github-count">{repos.length}</span>
        </div>
        <div className="github-search">
          <Search size={12} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter repositories" />
        </div>
        <div className="github-repo-list">
          {filteredRepos.map(repo => (
            <div className="github-repo-row" key={repo.fullName}>
              <span className="github-repo-icon">
                {repo.private ? <Lock size={12} /> : <Globe2 size={12} />}
              </span>
              <div className="github-repo-copy">
                <strong>{repo.name}</strong>
                <small>
                  {repo.fullName} · {repo.updatedAt ? formatRelative(new Date(repo.updatedAt).getTime()) : 'unknown'}
                </small>
              </div>
              <button
                type="button"
                className="btn ghost tiny"
                title="Clone repository"
                onClick={() => void clone(repo)}
                disabled={Boolean(cloning)}
              >
                {cloning === repo.fullName ? <Loader2 size={11} className="spin" /> : <GitFork size={12} />} Clone
              </button>
            </div>
          ))}
          {!filteredRepos.length && !loading && <p className="muted small">No repositories match this filter.</p>}
        </div>
      </div>

      <div className="github-foot">
        <span>
          <Users size={11} /> {user?.login || settings?.githubLogin || 'connected'}
        </span>
        <span>
          <ShieldCheck size={11} /> token saved
        </span>
      </div>
    </div>
  );
}
