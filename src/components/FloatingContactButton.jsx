import { useState } from 'react'

export default function FloatingContactButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="floating-contact-btn"
        onClick={() => setOpen(true)}
        aria-label="Contact"
      >
        ✉
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Get in touch</h2>
            <p>Questions or feedback about the app?</p>
            <a className="btn-primary" href="mailto:you@example.com">
              Email you@example.com
            </a>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
