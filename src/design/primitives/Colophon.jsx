/* global __BUILD_DATE__ */
import SupportLine from './SupportLine'

const buildDate = new Date(__BUILD_DATE__)

// Printed at the back of the book: who set it, when, and on what — and, first,
// where to find help, on every page for every reader.
export default function Colophon() {
  return (
    <footer className="colophon">
      <SupportLine />
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
