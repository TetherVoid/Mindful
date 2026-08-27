import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { faqItems } from '../data/faq'
import Reveal from '../components/Reveal'
import { StaggerGroup, StaggerItem } from '../components/Stagger'
import useReducedMotionPref from '../hooks/useReducedMotionPref'

const EASE = [0.22, 1, 0.36, 1]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null)
  const reduced = useReducedMotionPref()

  return (
    <div className="page">
      <Reveal as="h1">FAQ</Reveal>
      <StaggerGroup className="faq-list">
        {faqItems.map((item, i) => {
          const open = openIndex === i
          return (
            <StaggerItem className="card faq-item" key={item.question}>
              <button
                type="button"
                className="faq-question"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
              >
                <span>{item.question}</span>
                <span className="faq-caret" aria-hidden="true">
                  {open ? '−' : '+'}
                </span>
              </button>
              {reduced ? (
                open && <p className="faq-answer">{item.answer}</p>
              ) : (
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                    >
                      <p className="faq-answer">{item.answer}</p>
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
