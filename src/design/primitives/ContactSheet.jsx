// The "Get in touch" sheet. Opened from the dock's ✉ button on wider screens
// and from the colophon's "Get in touch" link everywhere (the ✉ button is
// hidden on phones, where the dock would otherwise sit over the page).
export default function ContactSheet({ open, onClose }) {
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Get in touch"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span>Correspondence</span>
          <span>Reply expected</span>
        </div>
        <div className="sheet-body">
          <h2>Write to the editor</h2>
          <p>Questions, corrections, or anything that felt wrong in the app.</p>
          <a className="btn btn--solid btn--block sheet-cta" href="mailto:you@example.com">
            you@example.com
          </a>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn--quiet btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
