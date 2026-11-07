import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CornerDownLeft } from 'lucide-react';
import { useStudio } from '../lib/store';

export function ConfirmDialog() {
  const request = useStudio(state => state.confirmRequest);
  const resolve = useStudio(state => state.resolveConfirm);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolve(false);
      if (event.key === 'Enter') resolve(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, resolve]);

  if (!request) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => resolve(false)}>
      <div className="dialog" onMouseDown={event => event.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="dialog-head">
          <span className={'dialog-icon ' + (request.danger ? 'danger' : '')}>
            <AlertTriangle size={18} />
          </span>
          <div>
            <h2>{request.title}</h2>
            <p>{request.message}</p>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => resolve(false)}>
            {request.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            className={'btn ' + (request.danger ? 'danger' : 'primary')}
            onClick={() => resolve(true)}
            autoFocus
          >
            {request.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog() {
  const request = useStudio(state => state.promptRequest);
  const resolve = useStudio(state => state.resolvePrompt);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.defaultValue || '');
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolve(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, resolve]);

  if (!request) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => resolve(null)}>
      <form
        className="dialog"
        onMouseDown={event => event.stopPropagation()}
        onSubmit={event => {
          event.preventDefault();
          resolve(value.trim() ? value.trim() : null);
        }}
      >
        <div className="dialog-head">
          <div>
            <h2>{request.title}</h2>
            {request.message && <p>{request.message}</p>}
          </div>
        </div>
        {request.label && <label className="field-label">{request.label}</label>}
        <input
          ref={inputRef}
          className="text-input"
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={request.placeholder}
        />
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => resolve(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {request.confirmLabel || 'Save'} <CornerDownLeft size={13} />
          </button>
        </div>
      </form>
    </div>
  );
}
