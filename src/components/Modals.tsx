import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Boxes,
  Check,
  Code2,
  FileCode2,
  FileDiff,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe2,
  Loader2,
  Monitor,
  Package,
  Terminal,
  WandSparkles,
  X
} from 'lucide-react';
import { useStudio } from '../lib/store';
import { dirName, languageFor } from '../lib/utils';

export type Template = 'react' | 'static' | 'node' | 'blank';
export type NewItemState = { type: 'file' | 'directory'; parent: string } | null;
export type ApplyCodeState = { code: string; language: string; defaultPath: string } | null;
export type DiffState = { title: string; diff: string; note?: string } | null;

const TEMPLATES: Array<{
  id: Template;
  label: string;
  description: string;
  icon: typeof Monitor;
  tone: string;
}> = [
  { id: 'react', label: 'React + Vite', description: 'TypeScript, Vite and a clean starter screen.', icon: Boxes, tone: 'cyan' },
  { id: 'static', label: 'Static site', description: 'HTML, CSS and JavaScript with no tooling.', icon: Globe2, tone: 'green' },
  { id: 'node', label: 'Node script', description: 'ES modules with an npm start script.', icon: Terminal, tone: 'violet' },
  { id: 'blank', label: 'Blank folder', description: 'Just a README and a .gitignore.', icon: Folder, tone: 'amber' }
];

export function NewProjectModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (root: string) => Promise<void>;
}) {
  const settings = useStudio(state => state.settings);
  const showToast = useStudio(state => state.showToast);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [template, setTemplate] = useState<Template>('react');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setTemplate('react');
    setParent(settings?.lastProjectRoot ? dirName(settings.lastProjectRoot) : '');
    window.setTimeout(() => nameRef.current?.focus(), 60);
  }, [open, settings?.lastProjectRoot]);

  if (!open) return null;

  const badName = Boolean(name) && (/[<>:"|?*\\/]/.test(name) || /[. ]$/.test(name));
  const target = parent && name ? parent.replace(/[\\/]$/, '') + '\\' + name.trim() : '';
  const canCreate = Boolean(parent.trim() && name.trim() && !badName && !busy);

  const chooseParent = async () => {
    try {
      const chosen = await window.studio.chooseProjectParent();
      if (chosen) setParent(chosen);
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not open folder picker', message: String(error) });
    }
  };

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const root = await window.studio.createProject(parent.trim(), name.trim(), template);
      showToast({ kind: 'success', title: 'Project created', message: root });
      onClose();
      await onCreated(root);
    } catch (error) {
      showToast({ kind: 'error', title: 'Could not create project', message: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="New project" eyebrow="SCAFFOLD A WORKSPACE" onClose={onClose} wide>
      <div className="new-project-grid">
        <div className="new-project-form">
          <label className="field-label">Project name</label>
          <input
            ref={nameRef}
            className={'text-input ' + (badName ? 'invalid' : '')}
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="aurora-studio"
            onKeyDown={event => {
              if (event.key === 'Enter') void create();
            }}
          />
          {badName && <span className="field-error">Use letters, numbers, dashes and dots. A name cannot end in a dot or space.</span>}

          <label className="field-label">Parent folder</label>
          <div className="inline-field">
            <input
              className="text-input"
              value={parent}
              onChange={event => setParent(event.target.value)}
              placeholder="Choose where to create the project"
            />
            <button type="button" className="btn secondary" onClick={() => void chooseParent()}>
              <FolderOpen size={13} /> Browse
            </button>
          </div>

          <span className="field-label">Template</span>
          <div className="template-grid">
            {TEMPLATES.map(item => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={'template-card tone-' + item.tone + (template === item.id ? ' active' : '')}
                  onClick={() => setTemplate(item.id)}
                >
                  <span className="template-icon">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className={'template-check ' + (template === item.id ? 'on' : '')}>
                    {template === item.id && <Check size={10} />}
                  </span>
                </button>
              );
            })}
          </div>

          {target && (
            <div className="target-preview">
              <Package size={12} />
              <code title={target}>{target}</code>
            </div>
          )}
        </div>

        <div className="new-project-aside">
          <span className="eyebrow">WHAT YOU GET</span>
          <div className="aside-feature">
            <WandSparkles size={14} />
            <span>
              <strong>Agent-ready scaffolding</strong>
              <small>Files, scripts and a gitignore that DARKI can edit right away.</small>
            </span>
          </div>
          <div className="aside-feature">
            <FileDiff size={14} />
            <span>
              <strong>Reviewable changes</strong>
              <small>Every agent write appears as a real diff before it touches disk.</small>
            </span>
          </div>
          <div className="aside-feature">
            <Globe2 size={14} />
            <span>
              <strong>Preview included</strong>
              <small>Start a static or managed dev server from the Preview tab.</small>
            </span>
          </div>
          <div className="aside-note">
            Projects are created directly inside the selected parent folder. Nothing is installed automatically, so you
            control when dependencies download.
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => void create()} disabled={!canCreate}>
          {busy ? <Loader2 size={13} className="spin" /> : <FolderPlus size={13} />} Create project
        </button>
      </div>
    </ModalShell>
  );
}

export function NewItemModal({
  state,
  onClose,
  onCreate
}: {
  state: NewItemState;
  onClose: () => void;
  onCreate: (path: string, type: 'file' | 'directory') => Promise<boolean>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state) return;
    const nextValue = state.parent ? state.parent + '/' : '';
    setValue(nextValue);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
    }, 40);
  }, [state]);

  if (!state) return null;

  const clean = value.trim().replace(/^[\\/]+/, '').replace(/\\/g, '/');
  const target = clean || state.parent;
  const canCreate = Boolean(clean && !clean.endsWith('/') && !busy);

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const ok = await onCreate(clean, state.type);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={state.type === 'file' ? 'New file' : 'New folder'}
      eyebrow="ADD TO THE WORKSPACE"
      onClose={onClose}
    >
      <p className="modal-copy">
        Paths are relative to the project root. Use forward slashes to create nested items, for example{' '}
        <code>src/components/Button.tsx</code>.
      </p>
      <label className="field-label">Path</label>
      <div className="new-item-input">
        {state.type === 'file' ? <FileCode2 size={14} /> : <Folder size={14} />}
        <input
          ref={inputRef}
          className="text-input"
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={state.type === 'file' ? 'src/new-file.ts' : 'src/new-folder'}
          onKeyDown={event => {
            if (event.key === 'Enter') void create();
          }}
        />
      </div>
      <div className="target-preview">
        {state.type === 'file' ? <FilePlus size={12} /> : <Folder size={12} />}
        <code title={target}>{target || '(project root)'}</code>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => void create()} disabled={!canCreate}>
          {busy ? <Loader2 size={13} className="spin" /> : state.type === 'file' ? <FilePlus size={13} /> : <FolderPlus size={13} />}
          Create {state.type}
        </button>
      </div>
    </ModalShell>
  );
}

export function ApplyCodeModal({
  state,
  onClose,
  onApply
}: {
  state: ApplyCodeState;
  onClose: () => void;
  onApply: (path: string, code: string) => Promise<boolean>;
}) {
  const root = useStudio(state => state.root);
  const files = useStudio(state => state.files);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state) return;
    setPath(state.defaultPath);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
  }, [state]);

  if (!state) return null;

  const extension = languageExtension(state.language);
  const suggested = path && !path.includes('.') && extension ? path + '.' + extension : path;
  const cleanTarget = suggested.trim().replace(/^\/+/, '');
  const willOverwrite = files.some(entry => entry.type === 'file' && entry.path === cleanTarget);
  const lines = state.code.split('\n').length;

  const apply = async () => {
    if (!cleanTarget.trim()) return;
    setBusy(true);
    try {
      const ok = await onApply(cleanTarget, state.code);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Apply code to a file" eyebrow="WRITE REVIEWED CODE" onClose={onClose} wide>
      <div className="apply-summary">
        <span className="apply-lang">
          <Code2 size={13} /> {state.language}
        </span>
        <span>{lines} lines</span>
        <span>{state.code.length.toLocaleString()} characters</span>
        {!root && <em>Open a project before applying code.</em>}
        {willOverwrite && <em className="warn">“{cleanTarget}” exists and will be overwritten.</em>}
      </div>
      <label className="field-label">Target file (project-relative)</label>
      <div className="new-item-input">
        <FileCode2 size={14} />
        <input
          ref={inputRef}
          className="text-input"
          value={path}
          onChange={event => setPath(event.target.value)}
          placeholder="src/example.ts"
          onKeyDown={event => {
            if (event.key === 'Enter') void apply();
          }}
        />
        <span className="apply-ext">{languageFor(cleanTarget || 'file.txt')}</span>
      </div>
      <div className="apply-preview">
        <div className="apply-preview-head">
          <span>CODE PREVIEW</span>
          <span>{cleanTarget || 'no target selected'}</span>
        </div>
        <pre>{state.code.slice(0, 5000)}</pre>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => void apply()} disabled={!root || !cleanTarget || busy}>
          {busy ? <Loader2 size={13} className="spin" /> : <WandSparkles size={13} />} Apply to file
        </button>
      </div>
    </ModalShell>
  );
}

export function DiffModal({ state, onClose }: { state: DiffState; onClose: () => void }) {
  const parsed = useMemo(() => {
    if (!state) return null;
    const lines = state.diff.replace(/\r\n/g, '\n').split('\n');
    let additions = 0;
    let deletions = 0;
    const rows = lines.map((line, index) => {
      let kind = 'context';
      if (line.startsWith('+++') || line.startsWith('---')) kind = 'meta';
      else if (line.startsWith('@@')) kind = 'hunk';
      else if (line.startsWith('diff ') || line.startsWith('index ')) kind = 'meta';
      else if (line.startsWith('+')) {
        kind = 'add';
        additions++;
      } else if (line.startsWith('-')) {
        kind = 'del';
        deletions++;
      }
      return { line, kind, index };
    });
    return { rows, additions, deletions };
  }, [state]);

  if (!state || !parsed) return null;

  return (
    <ModalShell title={state.title} eyebrow="UNIFIED DIFF" onClose={onClose} wide>
      <div className="diff-modal-stats">
        <span className="diff-add">+{parsed.additions} additions</span>
        <span className="diff-del">−{parsed.deletions} deletions</span>
        <span>{state.diff ? state.diff.split('\n').length : 0} lines</span>
        {state.note && <em>{state.note}</em>}
      </div>
      <div className="diff-full">
        {parsed.rows.map(row => (
          <div className={'diff-full-row ' + row.kind} key={row.index}>
            <span className="diff-full-line">{row.index + 1}</span>
            <code>{row.line || ' '}</code>
          </div>
        ))}
        {!state.diff && <div className="diff-full-empty">No diff output. The working tree may be clean.</div>}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  eyebrow,
  children,
  onClose,
  wide
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={'dialog modal-card ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function languageExtension(language: string) {
  const map: Record<string, string> = {
    tsx: 'tsx',
    jsx: 'jsx',
    typescript: 'ts',
    ts: 'ts',
    javascript: 'js',
    js: 'js',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    markdown: 'md',
    md: 'md',
    python: 'py',
    py: 'py',
    shell: 'sh',
    bash: 'sh',
    powershell: 'ps1',
    sql: 'sql',
    yaml: 'yml',
    yml: 'yml'
  };
  return map[language.toLowerCase()] || language.toLowerCase();
}
