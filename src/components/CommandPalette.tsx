import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, FileCode2, Search, type LucideIcon } from 'lucide-react';
import { useStudio } from '../lib/store';

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  run: () => void;
};

type Row =
  | { kind: 'command'; command: PaletteCommand }
  | { kind: 'file'; path: string; name: string };

export function CommandPalette({
  open,
  commands,
  onOpenFile,
  onClose
}: {
  open: boolean;
  commands: PaletteCommand[];
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  const files = useStudio(state => state.files);
  const root = useStudio(state => state.root);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const commandOnly = query.startsWith('>');
  const needle = (commandOnly ? query.slice(1) : query).trim().toLowerCase();

  const rows = useMemo<Row[]>(() => {
    const filteredCommands = commands
      .filter(command => !needle || (command.label + ' ' + (command.hint || '') + ' ' + command.group).toLowerCase().includes(needle))
      .slice(0, commandOnly ? 40 : 12)
      .map(command => ({ kind: 'command' as const, command }));
    const filteredFiles =
      !commandOnly && root && needle
        ? files
            .filter(entry => entry.type === 'file' && entry.path.toLowerCase().includes(needle))
            .slice(0, 9)
            .map(entry => ({
              kind: 'file' as const,
              path: entry.path,
              name: entry.path.split('/').pop() || entry.path
            }))
        : [];
    return [...filteredCommands, ...filteredFiles];
  }, [commands, files, needle, commandOnly, root]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>('.palette-row.active');
    element?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === 'command') row.command.run();
    else onOpenFile(row.path);
  };

  let lastGroup = '';

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="palette-input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search files, commands and actions…  (type > for commands)"
            spellCheck={false}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive(value => Math.min(rows.length - 1, value + 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive(value => Math.max(0, value - 1));
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                run(rows[active]);
              }
            }}
          />
          <kbd>ESC</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {rows.map((row, index) => {
            const group = row.kind === 'command' ? row.command.group : 'Files';
            const showGroup = group !== lastGroup;
            lastGroup = group;
            const isActive = index === active;
            if (row.kind === 'command') {
              const Icon = row.command.icon;
              return (
                <div key={'command-' + row.command.id}>
                  {showGroup && <div className="palette-group">{group}</div>}
                  <button
                    type="button"
                    className={'palette-row ' + (isActive ? 'active' : '')}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(row)}
                  >
                    <span className="palette-icon">
                      <Icon size={14} />
                    </span>
                    <span className="palette-copy">
                      <strong>{row.command.label}</strong>
                      {row.command.hint && <small>{row.command.hint}</small>}
                    </span>
                    {isActive && (
                      <span className="palette-enter">
                        <CornerDownLeft size={11} />
                      </span>
                    )}
                  </button>
                </div>
              );
            }
            return (
              <div key={'file-' + row.path}>
                {showGroup && <div className="palette-group">{group}</div>}
                <button
                  type="button"
                  className={'palette-row ' + (isActive ? 'active' : '')}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(row)}
                >
                  <span className="palette-icon file">
                    <FileCode2 size={14} />
                  </span>
                  <span className="palette-copy">
                    <strong>{row.name}</strong>
                    <small>{row.path}</small>
                  </span>
                  {isActive && (
                    <span className="palette-enter">
                      <ArrowRight size={11} />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
          {!rows.length && (
            <div className="palette-empty">
              <Search size={20} />
              <p>No matches. Try a file name, or type <kbd>&gt;</kbd> to browse commands.</p>
            </div>
          )}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>&gt;</kbd> commands only
          </span>
          <span className="palette-foot-count">
            {rows.length} result{rows.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
