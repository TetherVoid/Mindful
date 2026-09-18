import { useEffect, useRef } from 'react'

// What can hold focus inside the dialog. Disabled controls are excluded by the
// selector rather than filtered afterwards, because the confirm button is
// disabled while the action is in flight and must drop out of the cycle then.
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

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
  const dialogRef = useRef(null)

  // Focus in, and focus back out again.
  //
  // The dependency list is [open] alone, deliberately. `onCancel` is an inline
  // arrow at every call site and is therefore a new function on every render;
  // an effect that also depended on it would re-run constantly, and its
  // cleanup — which returns focus to whatever opened the dialog — would yank
  // focus out of the dialog mid-interaction. Only opening and closing should
  // move focus, so only `open` belongs here.
  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement
    cancelRef.current?.focus()
    return () => {
      // The trigger can have gone away or become disabled while the dialog was
      // open — Admin disables its row controls whenever an action is in flight
      // — in which case there is nothing to hand focus back to.
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) returnTo.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key !== 'Tab') return

      // aria-modal tells a screen reader the rest of the page is inert. Tab
      // does not honour that on its own, so without this the next Tab press
      // walks out of the dialog and into the page behind it, where the reader
      // has already been told there is nothing.
      const dialog = dialogRef.current
      if (!dialog) return
      const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      )
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const leaving = e.shiftKey ? active === first : active === last

      // `!dialog.contains(active)` catches focus that is already outside —
      // after a click on the backdrop, say — and pulls it back in.
      if (leaving || !dialog.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
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
