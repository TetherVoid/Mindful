import { motion } from 'motion/react'
import useReducedMotionPref from '../hooks/useReducedMotionPref'

const EASE = [0.22, 1, 0.36, 1]

// Container/item pair for scroll-triggered staggered entrances (dashboard
// tiles, habit rows, FAQ items, etc). Items must be direct-or-nested
// descendants of the group — motion propagates the "show" variant down the
// component tree once the group scrolls into view.
export function StaggerGroup({ children, className, stagger = 0.08, once = true, ...props }) {
  const reduced = useReducedMotionPref()

  if (reduced) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className, y = 20, as = 'div', ...props }) {
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
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
      {...props}
    >
      {children}
    </Component>
  )
}
