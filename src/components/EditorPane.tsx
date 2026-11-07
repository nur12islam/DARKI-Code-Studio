import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  ArrowRight,
  Code2,
  FileCode2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe2,
  History,
  Save,
  Settings,
  Sparkles,
  Trash2,
  X,
  Pencil
} from 'lucide-react';
import { useStudio } from '../lib/store';
import { baseName, dirName, extensionLabel, isDirty, languageFor, projectName } from '../lib/utils';

type Props = {
  onOpenFolder: () => void;
  onOpenRecent: (root: string) => void;
  onNewFile: () => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onSave: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
};

export function EditorPane({
  onOpenFolder,
  onOpenRecent,
  onNewFile,
  onNewProject,
  onOpenSettings,
  onSave,
  onRename,
  onDelete
}: Props) {
  const tabs = useStudio(state => state.tabs);
  const activePath = useStudio(state => state.activePath);
  const reveal = useStudio(state => state.reveal);
  const settings = useStudio(state => state.settings);
  const git = useStudio(state => state.git);
  const root = useStudio(state => state.root);
  const updateTab = useStudio(state => state.updateTab);
  const closeTab = useStudio(state => state.closeTab);
  const activateTab = useStudio(state => state.activateTab);
  const askConfirm = useStudio(state => state.askConfirm);
  const setEditorCursor = useStudio(state => state.patch);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const active = tabs.find(tab => tab.path === activePath) || null;

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('darki-obsidian', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '63718a', fontStyle: 'italic' },
        { token: 'string', foreground: 'a5d6a7' },
        { token: 'keyword', foreground: '7dd3fc' },
        { token: 'number', foreground: 'fbcfe8' },
        { token: 'type', foreground: 'c4b5fd' },
        { token: 'function', foreground: '93c5fd' },
        { token: 'variable', foreground: 'e2e8f0' }
      ],
      colors: {
        'editor.background': '#0b0f17',
        'editor.foreground': '#d8e2f2',
        'editorLineNumber.foreground': '#374151',
        'editorLineNumber.activeForeground': '#7dd3fc',
        'editorCursor.foreground': '#67e8f9',
        'editor.selectionBackground': '#164e6366',
        'editor.inactiveSelectionBackground': '#164e6333',
        'editor.lineHighlightBackground': '#111a2a',
        'editorIndentGuide.background1': '#1b2638',
        'editorIndentGuide.activeBackground1': '#334155',
        'editorWidget.background': '#101827',
        'editorWidget.border': '#22304a',
        'editorSuggestWidget.background': '#101827',
        'editorSuggestWidget.border': '#22304a',
        'editorSuggestWidget.selectedBackground': '#16243a',
        'scrollbarSlider.background': '#33415566',
        'scrollbarSlider.hoverBackground': '#47556988',
        'minimap.background': '#0b0f17'
      }
    });
    monaco.editor.setTheme('darki-obsidian');
    editor.onDidChangeCursorPosition(event => {
      setEditorCursor({ editorCursor: { line: event.position.lineNumber, column: event.position.column } });
    });
  };

  useEffect(() => {
    if (!reveal || !editorRef.current) return;
    if (activePath !== reveal.path) return;
    const position = { lineNumber: reveal.line, column: reveal.column };
    editorRef.current.setPosition(position);
    editorRef.current.revealPositionInCenter(position);
    editorRef.current.focus();
  }, [reveal, activePath]);

  const requestClose = async (path: string) => {
    const tab = tabs.find(item => item.path === path);
    if (!tab) return;
    if (isDirty(tab)) {
      const ok = await askConfirm({
        title: 'Discard unsaved changes?',
        message: `“${baseName(path)}” has changes that have not been saved. Closing the tab will discard them.`,
        confirmLabel: 'Discard and close',
        danger: true
      });
      if (!ok) return;
    }
    closeTab(path);
  };

  const pathParts = active ? active.path.split('/') : [];

  return (
    <main className="editor-area">
      <div className="tab-strip">
        <div className="tabs" role="tablist">
          {tabs.map(tab => {
            const dirty = isDirty(tab);
            const isActive = tab.path === activePath;
            return (
              <button
                type="button"
                key={tab.path}
                role="tab"
                aria-selected={isActive}
                className={'editor-tab ' + (isActive ? 'active' : '')}
                onClick={() => activateTab(tab.path)}
                onAuxClick={event => {
                  if (event.button === 1) void requestClose(tab.path);
                }}
                title={tab.path}
              >
                <FileCode2 size={13} className={'file-accent-' + languageFor(tab.path)} />
                <span className="tab-name">{baseName(tab.path)}</span>
                {dirty ? (
                  <span className="dirty-dot" title="Unsaved changes" />
                ) : (
                  <span
                    className="tab-close"
                    role="button"
                    tabIndex={-1}
                    title="Close tab"
                    onClick={event => {
                      event.stopPropagation();
                      void requestClose(tab.path);
                    }}
                  >
                    <X size={12} />
                  </span>
                )}
                {dirty && (
                  <span
                    className="tab-close always"
                    role="button"
                    title="Close tab"
                    onClick={event => {
                      event.stopPropagation();
                      void requestClose(tab.path);
                    }}
                  >
                    <X size={12} />
                  </span>
                )}
              </button>
            );
          })}
          <button type="button" className="tab-new" onClick={onNewFile} title="New file">
            +
          </button>
        </div>
        <div className="tab-actions">
          {active && (
            <>
              <button type="button" className="btn icon-only" title="Save (Ctrl+S)" onClick={() => onSave(active.path)}>
                <Save size={14} />
              </button>
              <button type="button" className="btn icon-only" title="Rename file" onClick={() => onRename(active.path)}>
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="btn icon-only danger-hover"
                title="Delete file"
                onClick={() => onDelete(active.path)}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {active ? (
        <>
          <div className="breadcrumbs">
            <span className="breadcrumb-root">
              <Code2 size={12} /> {projectName(root)}
            </span>
            {pathParts.map((part, index) => (
              <span className="breadcrumb-part" key={index}>
                <ArrowRight size={10} />
                {part}
              </span>
            ))}
            <span className="breadcrumb-spacer" />
            <span className="language-pill">{extensionLabel(active.path)}</span>
            {isDirty(active) && <span className="unsaved-pill">UNSAVED</span>}
          </div>
          <div className="editor-host">
            <Editor
              height="100%"
              path={active.path}
              language={languageFor(active.path)}
              value={active.content}
              onChange={value => updateTab(active.path, value ?? '')}
              onMount={handleMount}
              theme="darki-obsidian"
              options={{
                fontSize: settings?.editorFontSize ?? 14,
                fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                wordWrap: settings?.editorWordWrap === false ? 'off' : 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 14, bottom: 20 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'all',
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                stickyScroll: { enabled: true },
                tabSize: 2,
                insertSpaces: true,
                detectIndentation: true,
                suggest: { showWords: true },
                quickSuggestions: { other: true, comments: false, strings: true }
              }}
            />
          </div>
        </>
      ) : (
        <Welcome
          onOpenFolder={onOpenFolder}
          onOpenRecent={onOpenRecent}
          onNewFile={onNewFile}
          onNewProject={onNewProject}
          onOpenSettings={onOpenSettings}
          gitBranch={git?.branch}
        />
      )}
    </main>
  );
}

function Welcome({
  onOpenFolder,
  onOpenRecent,
  onNewFile,
  onNewProject,
  onOpenSettings,
  gitBranch
}: {
  onOpenFolder: () => void;
  onOpenRecent: (root: string) => void;
  onNewFile: () => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  gitBranch?: string;
}) {
  const settings = useStudio(state => state.settings);
  const recent = settings?.recentProjects || [];
  return (
    <div className="welcome">
      <div className="welcome-glow" />
      <div className="welcome-inner">
        <div className="welcome-brand">
          <div className="brand-mark large">
            <Code2 size={26} />
          </div>
          <span className="welcome-kicker">
            <Sparkles size={12} /> DESKTOP CODING AGENT
          </span>
        </div>
        <h1>
          Build with an agent
          <br />
          <span>that sees your code.</span>
        </h1>
        <p className="welcome-copy">
          Open a folder, describe the outcome, and review every change before it lands. DARKI reads files, edits them,
          runs checks and publishes to GitHub.
        </p>
        <div className="welcome-actions">
          <button type="button" className="btn primary large" onClick={onOpenFolder}>
            <FolderOpen size={16} /> Open a project
          </button>
          <button type="button" className="btn secondary large" onClick={onNewProject}>
            <FolderPlus size={16} /> New project
          </button>
          <button type="button" className="btn secondary large" onClick={onNewFile}>
            <FilePlus size={16} /> New file
          </button>
          <button type="button" className="btn ghost large" onClick={onOpenSettings}>
            <Settings size={16} /> Configure AI
          </button>
        </div>

        {recent.length > 0 && (
          <div className="recent-projects">
            <div className="welcome-section-title">
              <History size={13} /> Recent projects
            </div>
            <div className="recent-list">
              {recent.slice(0, 4).map(project => (
                <button type="button" key={project} className="recent-card" onClick={() => onOpenRecent(project)}>
                  <FolderOpen size={15} />
                  <span>
                    <strong>{baseName(project)}</strong>
                    <small>{dirName(project)}</small>
                  </span>
                  {gitBranch && <GitBranch size={12} />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="welcome-features">
          <div className="welcome-feature">
            <span className="feature-icon cyan">
              <Sparkles size={16} />
            </span>
            <div>
              <b>Visible agent</b>
              <small>Every file read, edit and command is shown.</small>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon violet">
              <ShieldIcon />
            </span>
            <div>
              <b>Approval by default</b>
              <small>Review a real diff before it touches disk.</small>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon green">
              <Globe2 size={16} />
            </span>
            <div>
              <b>Live preview</b>
              <small>Static server and managed dev server.</small>
            </div>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon amber">
              <GitBranch size={16} />
            </span>
            <div>
              <b>GitHub flow</b>
              <small>Commit, push, branch and open pull requests.</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return <span className="shield-glyph">✓</span>;
}
