import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useStudio } from '../lib/store';
import type { TreeEntry } from '../lib/types';
import { compareTreeEntries, fileAccent, isDirty, projectName } from '../lib/utils';

type Props = {
  onOpenFile: (path: string) => void;
  onOpenRecent: (root: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
};

function FileGlyph({ path }: { path: string }) {
  const accent = fileAccent(path);
  const extension = path.split('.').pop()?.toLowerCase() || '';
  const className = 'tree-file-icon accent-' + accent;
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte'].includes(extension)) {
    return <FileCode2 size={14} className={className} />;
  }
  if (['json', 'jsonc'].includes(extension)) return <FileJson size={14} className={className} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(extension)) {
    return <FileImage size={14} className={className} />;
  }
  if (['md', 'mdx', 'txt'].includes(extension)) return <FileText size={14} className={className} />;
  if (['yml', 'yaml', 'toml', 'ini', 'env', 'gitignore'].includes(extension)) {
    return <FileCog size={14} className={className} />;
  }
  return <File size={14} className={className} />;
}

export function ExplorerPanel({ onOpenFile, onOpenRecent, onNewFile, onNewFolder, onRefresh, onRename, onDelete }: Props) {
  const files = useStudio(state => state.files);
  const root = useStudio(state => state.root);
  const activePath = useStudio(state => state.activePath);
  const tabs = useStudio(state => state.tabs);
  const filesLoading = useStudio(state => state.filesLoading);
  const git = useStudio(state => state.git);
  const settings = useStudio(state => state.settings);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);

  const dirtyPaths = useMemo(
    () => new Set(tabs.filter(tab => isDirty(tab)).map(tab => tab.path)),
    [tabs]
  );

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    let list: TreeEntry[];
    if (!query) {
      list = files.filter(entry => {
        const parts = entry.path.split('/');
        for (let index = 1; index < parts.length; index++) {
          if (collapsed.has(parts.slice(0, index).join('/'))) return false;
        }
        return true;
      });
    } else {
      const matching = files.filter(entry => entry.type === 'file' && entry.path.toLowerCase().includes(query));
      const ancestors = new Set<string>();
      for (const entry of matching) {
        const parts = entry.path.split('/');
        for (let index = 1; index < parts.length; index++) ancestors.add(parts.slice(0, index).join('/'));
      }
      list = files.filter(entry => matching.some(item => item.path === entry.path) || ancestors.has(entry.path));
    }
    return list
      .map(entry => ({ ...entry, depth: entry.path.split('/').length - 1 }))
      .sort(compareTreeEntries);
  }, [files, filter, collapsed]);

  const toggleFolder = (path: string) => {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsed(new Set(files.filter(entry => entry.type === 'directory').map(entry => entry.path)));
  };

  return (
    <div className="side-panel explorer-panel">
      <div className="side-head">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h2>Explorer</h2>
        </div>
        <div className="side-head-actions">
          <button type="button" className="icon-btn" title="New file" onClick={onNewFile} disabled={!root}>
            <Plus size={14} />
          </button>
          <button type="button" className="icon-btn" title="New folder" onClick={onNewFolder} disabled={!root}>
            <FolderPlus size={14} />
          </button>
          <button type="button" className="icon-btn" title="Refresh" onClick={onRefresh} disabled={!root}>
            <RefreshCw size={13} className={filesLoading ? 'spin' : ''} />
          </button>
          <button type="button" className="icon-btn" title="Collapse all folders" onClick={collapseAll} disabled={!root}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="project-block">
        <div className="project-name">
          <FolderOpen size={14} />
          <span>{root ? projectName(root) : 'No folder opened'}</span>
        </div>
        {root && (
          <button type="button" className="project-path" title={root} onClick={onRefresh}>
            {root}
          </button>
        )}
      </div>

      <div className="side-filter">
        <input
          value={filter}
          onChange={event => setFilter(event.target.value)}
          placeholder="Filter files"
          disabled={!root}
          aria-label="Filter files"
        />
        {filter && (
          <button type="button" className="filter-clear" onClick={() => setFilter('')} title="Clear filter">
            ×
          </button>
        )}
      </div>

      <div className="file-tree" role="tree">
        {!root && (
          <div className="side-empty">
            <Folder size={24} />
            <p>Open a folder to browse files.</p>
          </div>
        )}
        {root && !files.length && !filesLoading && (
          <div className="side-empty">
            <File size={22} />
            <p>This folder is empty.</p>
            <button type="button" className="btn secondary tiny" onClick={onNewFile}>
              Create a file
            </button>
          </div>
        )}
        {visible.map(entry => {
          const isFolder = entry.type === 'directory';
          const isCollapsed = collapsed.has(entry.path);
          const isActive = entry.path === activePath;
          const isDirtyFile = dirtyPaths.has(entry.path);
          return (
            <div
              key={entry.path}
              role="treeitem"
              aria-expanded={isFolder ? !isCollapsed : undefined}
              className={
                'tree-row ' +
                (isActive ? 'selected ' : '') +
                (isFolder ? 'folder ' : 'file ') +
                (filter ? 'filtered' : '')
              }
              style={{ paddingLeft: 8 + entry.depth * 13 }}
              onClick={() => (isFolder ? toggleFolder(entry.path) : onOpenFile(entry.path))}
              onMouseEnter={() => setHovered(entry.path)}
              onMouseLeave={() => setHovered(current => (current === entry.path ? null : current))}
              title={entry.path}
            >
              <span className="tree-caret">
                {isFolder ? (
                  isCollapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )
                ) : null}
              </span>
              {isFolder ? (
                isCollapsed ? (
                  <Folder size={14} className="folder-icon" />
                ) : (
                  <FolderOpen size={14} className="folder-icon" />
                )
              ) : (
                <FileGlyph path={entry.path} />
              )}
              <span className="tree-name">{entry.name}</span>
              {isDirtyFile && <span className="tree-dirty" title="Unsaved changes" />}
              {!isFolder && hovered === entry.path && (
                <span className="tree-row-actions">
                  <button
                    type="button"
                    title="Rename"
                    onClick={event => {
                      event.stopPropagation();
                      onRename(entry.path);
                    }}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={event => {
                      event.stopPropagation();
                      onDelete(entry.path);
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="side-footer">
        <div className="side-footer-row">
          <span>
            <span className="status-dot" /> {files.filter(entry => entry.type === 'file').length} files
          </span>
          {git?.isRepo && (
            <span className="side-branch" title={git.remoteUrl || 'Local repository'}>
              <span className="mini-branch" /> {git.branch}
            </span>
          )}
        </div>
        {settings?.recentProjects.length ? (
          <div className="recent-mini">
            <span className="eyebrow">RECENT</span>
            {settings.recentProjects.slice(0, 2).map(project => (
              <button
                type="button"
                key={project}
                className="recent-mini-row"
                onClick={() => onOpenRecent(project)}
                title={project}
              >
                <Folder size={11} /> {project.split(/[\\/]/).filter(Boolean).pop()}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
