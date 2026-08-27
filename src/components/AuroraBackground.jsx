import { motion, useScroll, useTransform } from 'motion/react'
import useReducedMotionPref from '../hooks/useReducedMotionPref'

// Ambient, accent-colored gradient blobs drifting slowly behind page
// content. The blobs' own idle drift is plain CSS (cheap, always running);
// the wrapper additionally shifts on a scroll-linked parallax so the whole
// layer reads as sitting a little behind the page as you scroll — the two
// effects live on different elements so their transforms don't fight.
export default function AuroraBackground({ variant = 'default' }) {
  const reduced = useReducedMotionPref()
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 1000], [0, reduced ? 0 : -120])

  return (
    <motion.div className={`aurora-bg aurora-bg--${variant}`} aria-hidden="true" style={{ y }}>
      <span className="aurora-blob aurora-blob-a" />
      <span className="aurora-blob aurora-blob-b" />
      <span className="aurora-blob aurora-blob-c" />
    </motion.div>
  )
}
