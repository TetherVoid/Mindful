import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchThoughtRecords } from '@backend/services/search'
import { faqItems } from '@frontend/content/faq'

export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [thoughtResults, setThoughtResults] = useState([])
  const navigate = useNavigate()
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!query.trim()) {
      setThoughtResults([])
      return
    }
    const requestId = ++requestIdRef.current
    const timeout = setTimeout(async () => {
      const { data } = await searchThoughtRecords(query)
      // A slower, now-stale request can resolve after a newer one — only
      // apply results if this is still the most recent request fired.
      if (requestIdRef.current === requestId) {
        setThoughtResults(data ?? [])
      }
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const faqResults = query.trim()
    ? faqItems.filter(
        (f) =>
          f.question.toLowerCase().includes(query.toLowerCase()) ||
          f.answer.toLowerCase().includes(query.toLowerCase())
      )
    : []

  const total = thoughtResults.length + faqResults.length

  return (
    <div className="overlay overlay--top" onClick={onClose}>
      <div
        className="sheet search-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Search the almanac"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span>Concordance</span>
          <span>{query.trim() ? `${total} found` : 'Esc to close'}</span>
        </div>
        <input
          autoFocus
          type="search"
          placeholder="Search case notes and marginalia…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="search-results">
          {query.trim() === '' && <p className="search-hint">Start typing to search.</p>}

          {thoughtResults.length > 0 && (
            <div>
              <p className="search-group-label">Case notes</p>
              {thoughtResults.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    navigate('/thoughts')
                    onClose()
                  }}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span>{r.situation}</span>
                </button>
              ))}
            </div>
          )}

          {faqResults.length > 0 && (
            <div>
              <p className="search-group-label">Marginalia</p>
              {faqResults.map((f, i) => (
                <button
                  key={f.question}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    navigate('/faq')
                    onClose()
                  }}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span>{f.question}</span>
                </button>
              ))}
            </div>
          )}

          {query.trim() && total === 0 && <p className="search-hint">Nothing found.</p>}
        </div>
      </div>
    </div>
  )
}
