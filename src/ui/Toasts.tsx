import { actions, useApp } from '../state/store'

export function Toasts() {
  const toasts = useApp(s => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span>{t.text}</span>
          {t.action && <button className="toast-action" onClick={() => { t.action!.run(); actions.dismissToast(t.id) }}>{t.action.label}</button>}
          <button className="toast-x" aria-label="Dismiss" onClick={() => actions.dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
