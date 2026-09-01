import { motion } from 'motion/react'
import useReducedMotionPref from '../hooks/useReducedMotionPref'
import useRevealed from '../hooks/useRevealed'
import { EASE, delayForIndex, useStaggerConfig } from './Stagger'

// Fades/slides a single block in as it scrolls into view.
//
// Position in the sequence is set by `index` — the same transition index the
// staggered lists use — so a page's blocks can be choreographed against each
// other: the folio header at 0, the first panel at 1, the chart at 2. Passing
// `delay` directly still works and overrides the index.
//
// Falls back to a plain element when reduced motion is on, since motion's
// JS-driven animations bypass the CSS transition-duration override that
// handles reduced-motion everywhere else in this app.
export default function Reveal({
  children,
  className,
  index = 0,
  delay,
  y = 24,
  as = 'div',
  style,
  ...props
}) {
  const reduced = useReducedMotionPref()
  const config = useStaggerConfig()
  const resolvedDelay = delay ?? delayForIndex(index, config)
  const [ref, shown] = useRevealed({ margin: '-80px' })

  const indexStyle = { ...style, '--transition-index': index }

  if (reduced) {
    const Plain = as
    return (
      <Plain className={className} style={indexStyle} {...props}>
        {children}
      </Plain>
    )
  }

  const Component = motion[as]
  return (
    <Component
      ref={ref}
      className={className}
      style={indexStyle}
      data-transition-index={index}
      initial={{ opacity: 0, y }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, delay: resolvedDelay, ease: EASE }}
      {...props}
    >
      {children}
    </Component>
  )
}
