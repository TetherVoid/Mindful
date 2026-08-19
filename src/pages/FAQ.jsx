import { useState } from 'react'
import { faqItems } from '../data/faq'

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null)

  return (
    <div className="page">
      <h1>FAQ</h1>
      <div className="faq-list">
        {faqItems.map((item, i) => {
          const open = openIndex === i
          return (
            <div className="card faq-item" key={item.question}>
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
              {open && <p className="faq-answer">{item.answer}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
