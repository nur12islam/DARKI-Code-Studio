import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useStudio } from '../lib/store';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle
};

export function Toasts() {
  const toasts = useStudio(state => state.toasts);
  const dismiss = useStudio(state => state.dismissToast);
  const ids = toasts.map(toast => toast.id).join('|');

  useEffect(() => {
    const timers = toasts.map(toast =>
      window.setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 7000 : 4500)
    );
    return () => timers.forEach(timer => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(toast => {
        const Icon = ICONS[toast.kind];
        return (
          <div className={'toast toast-' + toast.kind} key={toast.id}>
            <Icon size={17} className="toast-icon" />
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <span>{toast.message}</span>}
              {toast.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    toast.action?.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} title="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
