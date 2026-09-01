import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { faqItems } from '../data/faq'
import Reveal from '../components/Reveal'
import { StaggerGroup, StaggerItem } from '../components/Stagger'
import useReducedMotionPref from '../hooks/useReducedMotionPref'

const EASE = [0.2, 0.9, 0.3, 1]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null)
  const reduced = useReducedMotionPref()

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14}>
        <div>
          <p className="folio-kicker">Section 05</p>
          <h1 className="folio-title">
            <em>Marginalia</em>
          </h1>
          <p className="folio-standfirst">
            Notes in the margin — what the exercises are for, and what happens to what you write.
          </p>
        </div>
        <div className="folio-meta">
          <span>
            <b>{faqItems.length}</b> notes
          </span>
        </div>
      </Reveal>

      <StaggerGroup className="marginalia">
        {faqItems.map((item, i) => {
          const open = openIndex === i
          return (
            <StaggerItem className={`marginalia-item ${open ? 'open' : ''}`} key={item.question}>
              <button
                type="button"
                className="marginalia-q"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
              >
                <span className="marginalia-num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3>{item.question}</h3>
                <span className="marginalia-sign" aria-hidden="true">
                  {open ? '−' : '+'}
                </span>
              </button>

              {reduced ? (
                open && <p className="marginalia-a">{item.answer}</p>
              ) : (
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                    >
                      <p className="marginalia-a">{item.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </StaggerItem>
          )
        })}
      </StaggerGroup>
    </div>
  )
}
