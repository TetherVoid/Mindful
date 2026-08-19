import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { faqItems } from '../data/faq'

// PostgREST's `.or()` filter string treats commas and parens as structural
// separators. Quoting the value and escaping any backslash/quote inside it
// keeps user-typed punctuation (",", "(", ")") from breaking the filter.
function escapeForOrFilter(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

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
      const pattern = escapeForOrFilter(`%${query}%`)
      const { data } = await supabase
        .from('thought_records')
        .select('id, situation, automatic_thought')
        .or(`situation.ilike.${pattern},automatic_thought.ilike.${pattern}`)
        .limit(5)
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="search-overlay" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="search"
          placeholder="Search thought records and FAQ…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="search-results">
          {query.trim() === '' && <p className="search-hint">Start typing to search.</p>}

          {thoughtResults.length > 0 && (
            <div className="search-group">
              <h3>Thought records</h3>
              {thoughtResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    navigate('/thoughts')
                    onClose()
                  }}
                >
                  {r.situation}
                </button>
              ))}
            </div>
          )}

          {faqResults.length > 0 && (
            <div className="search-group">
              <h3>FAQ</h3>
              {faqResults.map((f) => (
                <button
                  key={f.question}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    navigate('/faq')
                    onClose()
                  }}
                >
                  {f.question}
                </button>
              ))}
            </div>
          )}

          {query.trim() && thoughtResults.length === 0 && faqResults.length === 0 && (
            <p className="search-hint">No results.</p>
          )}
        </div>
      </div>
    </div>
  )
}
