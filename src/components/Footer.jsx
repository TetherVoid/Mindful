/* global __BUILD_DATE__ */
const buildDate = new Date(__BUILD_DATE__)

export default function Footer() {
  return (
    <footer className="site-footer">
      <p>Last updated {buildDate.toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
    </footer>
  )
}
