import { motion, useScroll, useTransform } from 'motion/react'
import useReducedMotionPref from '../hooks/useReducedMotionPref'

// The page it's all printed on. Three layers, none of them blurred:
//
//   1. a ruled grid, masked off toward the bottom so it reads as a page
//      edge rather than as wallpaper
//   2. two slow accent washes (ink bleeding through the sheet)
//   3. a tiled SVG turbulence grain (a CSS background, so it repeats rather
//      than depending on an inline <svg>'s intrinsic size), blended so light
//      mode gets tooth and dark mode gets a faint silver speckle
//
// The grid itself parallaxes on scroll — a shade slower than the content, so
// the page reads as sitting ON something rather than floating.
export default function GridField({ variant = 'app' }) {
  const reduced = useReducedMotionPref()
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 1200], [0, reduced ? 0 : -90])

  return (
    <div className={`grid-field grid-field--${variant}`} aria-hidden="true">
      <motion.div className="grid-field-rules" style={{ y }} />
      <span className="grid-field-wash" />
      <span className="grid-field-wash grid-field-wash-2" />
      <span className="grid-field-grain" />
    </div>
  )
}
