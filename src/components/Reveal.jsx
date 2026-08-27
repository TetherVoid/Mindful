import { motion } from 'motion/react'
import useReducedMotionPref from '../hooks/useReducedMotionPref'

const EASE = [0.22, 1, 0.36, 1]

// Fades/slides a single block in as it scrolls into view. Falls back to a
// plain element (no animation) when the user has reduced motion on, since
// motion's JS-driven animations skip the CSS transition-duration override
// that handles reduced-motion everywhere else in this app.
export default function Reveal({ children, className, delay = 0, y = 28, as = 'div', once = true, ...props }) {
  const reduced = useReducedMotionPref()

  if (reduced) {
    const Plain = as
    return (
      <Plain className={className} {...props}>
        {children}
      </Plain>
    )
  }

  const Component = motion[as]
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      {...props}
    >
      {children}
    </Component>
  )
}
