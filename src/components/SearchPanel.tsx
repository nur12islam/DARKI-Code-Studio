import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileSearch, Loader2, Search, X } from 'lucide-react';
import { useStudio } from '../lib/store';
import type { SearchMatch } from '../lib/types';
import { baseName } from '../lib/utils';

type Props = {
  onOpenFileAt: (path: string, line: number, column: number) => void;
};

export function SearchPanel({ onOpenFileAt }: Props) {
  const root = useStudio(state => state.root);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!root || !query.trim()) {
      setMatches([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void window.studio
        .searchFiles(root, query.trim(), 200)
        .then(result => {
          if (cancelled) return;
          setMatches(result);
          setExpanded(new Set(result.map(match => match.path)));
        })
        .catch(reason => {
          if (cancelled) return;
          setError(String(reason));
          setMatches([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [root, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const match of matches) {
      const list = map.get(match.path) || [];
      list.push(match);
      map.set(match.path, list);
    }
    return [...map.entries()];
  }, [matches]);

  const toggle = (path: string) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="side-panel search-panel">
      <div className="side-head">
        <div>
          <span className="eyebrow">FIND IN PROJECT</span>
          <h2>Search</h2>
        </div>
      </div>
      <div className="search-box">
        <Search size={14} />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={root ? 'Search text across files…' : 'Open a project first'}
          disabled={!root}
          autoFocus
          onKeyDown={event => {
            if (event.key === 'Enter' && matches[0]) {
              onOpenFileAt(matches[0].path, matches[0].line, matches[0].column);
            }
          }}
        />
        {query && (
          <button type="button" className="icon-btn tiny" onClick={() => setQuery('')} title="Clear search">
            <X size={13} />
          </button>
        )}
      </div>
      <div className="search-summary">
        {loading && (
          <span>
            <Loader2 size={12} className="spin" /> Searching…
          </span>
        )}
        {!loading && query && !error && (
          <span>
            {matches.length} result{matches.length === 1 ? '' : 's'} in {grouped.length} file{grouped.length === 1 ? '' : 's'}
          </span>
        )}
        {!query && <span>Case-insensitive search. Enter opens the first match.</span>}
      </div>

      {error && <div className="inline-error">{error}</div>}

      {!query && (
        <div className="side-empty tall">
          <FileSearch size={26} />
          <p>Find a function, class, string or configuration key across the project.</p>
        </div>
      )}

      <div className="search-results">
        {grouped.map(([path, fileMatches]) => {
          const open = expanded.has(path);
          return (
            <div className="search-file" key={path}>
              <button type="button" className="search-file-head" onClick={() => toggle(path)} title={path}>
                <ArrowRight size={12} className={open ? 'rotated' : ''} />
                <strong>{baseName(path)}</strong>
                <small>{path}</small>
                <em>{fileMatches.length}</em>
              </button>
              {open &&
                fileMatches.map(match => (
                  <button
                    type="button"
                    key={match.path + ':' + match.line + ':' + match.column}
                    className="search-match"
                    onClick={() => onOpenFileAt(match.path, match.line, match.column)}
                  >
                    <span className="search-line">{match.line}</span>
                    <span className="search-preview">
                      {highlight(match.preview, query)}
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {query && !loading && !matches.length && !error && (
        <div className="side-empty">
          <Search size={22} />
          <p>No matches for “{query}”.</p>
          <small className="muted">Search is case-insensitive. Ask DARKI for regex or symbol searches.</small>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}
