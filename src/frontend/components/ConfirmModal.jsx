import { useEffect, useRef } from 'react'

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmDisabled = false,
  slug = 'Confirmation required',
  onConfirm,
  onCancel,
}) {
  // Focus lands on Cancel, not the destructive action, so a reflexive
  // Enter/Space right after opening can't trigger an unrecoverable delete.
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span>{slug}</span>
          <span>Esc to cancel</span>
        </div>
        <div className="sheet-body">
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
        <div className="sheet-actions">
          <button ref={cancelRef} type="button" className="btn btn--quiet btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger btn--sm" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
