import { createContext, useContext, useMemo } from 'react'
import { motion } from 'motion/react'
import useReducedMotionPref from '../hooks/useReducedMotionPref'
import useRevealed from '../hooks/useRevealed'

export const EASE = [0.2, 0.9, 0.3, 1]

// Every scroll reveal in the app is positioned by a *transition index* rather
// than by document order. An element's delay is always `index * step`, so two
// things sharing an index animate together, and the sequence holds whether the
// items are siblings, are wrapped in other components, or live in separate
// groups on the page.
//
// This replaces motion's `staggerChildren`, which only staggers direct
// children in DOM order: it silently stops working the moment an item gains a
// wrapper, and it offers no way to say "this one goes third".
//
// The index is passed explicitly. An auto-incrementing counter would have to
// mutate a ref during render, which misassigns indices under StrictMode's
// double render and collides when a row is inserted later — so call sites pass
// `index={i}` from the map they already have.

const StaggerContext = createContext(null)

export function useStaggerConfig() {
  return useContext(StaggerContext)
}

const DEFAULTS = { step: 0.07, base: 0, max: 0.6 }

export function delayForIndex(index, config) {
  const { step, base, max } = { ...DEFAULTS, ...(config ?? {}) }
  // Capped, so the last row of a long list doesn't wait a second and a half.
  // Past a point a stagger stops reading as sequence and starts reading as lag.
  return base + Math.min(index * step, max)
}

// Sets the timing for the reveals inside it. Purely configuration — it holds
// no state and imposes no wrapper behaviour of its own.
export function StaggerGroup({
  children,
  className,
  step = DEFAULTS.step,
  base = DEFAULTS.base,
  max = DEFAULTS.max,
  as = 'div',
  ...props
}) {
  const value = useMemo(() => ({ step, base, max }), [step, base, max])
  const Component = as

  return (
    <StaggerContext.Provider value={value}>
      <Component className={className} {...props}>
        {children}
      </Component>
    </StaggerContext.Provider>
  )
}

export function StaggerItem({
  children,
  className,
  index = 0,
  y = 18,
  as = 'div',
  style,
  ...props
}) {
  const reduced = useReducedMotionPref()
  const config = useContext(StaggerContext)
  const delay = delayForIndex(index, config)
  const [ref, shown] = useRevealed()

  // The index is published as a custom property as well, so CSS can key off
  // the same number the JS animation uses without a second source of truth.
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
      transition={{ duration: 0.45, delay, ease: EASE }}
      {...props}
    >
      {children}
    </Component>
  )
}
