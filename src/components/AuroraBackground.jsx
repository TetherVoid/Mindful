// Ambient, accent-colored gradient blobs drifting slowly behind page
// content. Pure CSS (no canvas/WebGL) so it's cheap enough to mount on
// every route, not just the auth screens. Reduced motion is handled for
// free by the global animation-duration override in index.css.
export default function AuroraBackground({ variant = 'default' }) {
  return (
    <div className={`aurora-bg aurora-bg--${variant}`} aria-hidden="true">
      <span className="aurora-blob aurora-blob-a" />
      <span className="aurora-blob aurora-blob-b" />
      <span className="aurora-blob aurora-blob-c" />
    </div>
  )
}
