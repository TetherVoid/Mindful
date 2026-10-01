/* global __BUILD_DATE__ */
import SupportLine from './SupportLine'

const buildDate = new Date(__BUILD_DATE__)

// Printed at the back of the book: who set it, when, and on what — and, first,
// where to find help, on every page for every reader.
//
// `onContact`, when given, adds "Get in touch" — the one way to reach the sheet
// on phones, where the dock hides its ✉ button.
export default function Colophon({ onContact }) {
  return (
    <footer className="colophon">
      <SupportLine />
      {onContact && (
        <button type="button" className="colophon-contact" onClick={onContact}>
          Get in touch
        </button>
      )}
      <span>
        Set in <b>Newsreader</b> &amp; <b>JetBrains Mono</b>
      </span>
      <span>
        Impression of{' '}
        <b>{buildDate.toLocaleDateString(undefined, { dateStyle: 'medium' })}</b>
      </span>
      <span>Mindful · Vol. I</span>
    </footer>
  )
}
