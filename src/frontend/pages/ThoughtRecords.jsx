import { useEffect, useState } from 'react'
import {
  listThoughtRecordsPage,
  createThoughtRecord,
  deleteThoughtRecord,
} from '@backend/services/thoughts'
import { useAuth } from '@backend/auth/AuthContext'
import ConfirmModal from '@frontend/components/ConfirmModal'
import FormSuccess from '@frontend/components/FormSuccess'
import FormError from '@frontend/components/FormError'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'

// Records are shown a page at a time, newest first. The header always gives
// the true total on file — the same number the day sheet gives — however many
// have been shown so far.
const PAGE_SIZE = 20

const emptyForm = {
  situation: '',
  automatic_thought: '',
  emotion: '',
  emotion_intensity: 5,
  evidence_for: '',
  evidence_against: '',
  balanced_thought: '',
}

function recordToText(r) {
  return [
    `Situation: ${r.situation}`,
    `Automatic thought: ${r.automatic_thought}`,
    r.emotion ? `Emotion: ${r.emotion} (${r.emotion_intensity}/10)` : null,
    r.evidence_for ? `Evidence for: ${r.evidence_for}` : null,
    r.evidence_against ? `Evidence against: ${r.evidence_against}` : null,
    r.balanced_thought ? `Balanced thought: ${r.balanced_thought}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

// The emotion's strength drawn as a 10-segment gauge rather than a bare
// number — you can compare two records at a glance without reading them.
function Intensity({ value }) {
  return (
    <span className="intensity">
      <span className="intensity-bars" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < value ? 'on' : ''} />
        ))}
      </span>
      <span className="intensity-value">{value}/10</span>
    </span>
  )
}

export default function ThoughtRecords() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [total, setTotal] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadRecords() {
    setLoading(true)
    setError(null)
    const { data, count, error: loadError } = await listThoughtRecordsPage({ offset: 0, limit: PAGE_SIZE })

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setRecords(data ?? [])
    setTotal(count ?? (data ?? []).length)
    setLoading(false)
  }

  // The next page starts where the list on screen ends. Records added or
  // deleted on this page shift the server's list by the same amount as the
  // local one, so the offset stays right; ids are de-duplicated regardless.
  async function loadMore() {
    setLoadingMore(true)
    setError(null)
    const { data, count, error: loadError } = await listThoughtRecordsPage({
      offset: records.length,
      limit: PAGE_SIZE,
    })
    setLoadingMore(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setRecords((prev) => {
      const known = new Set(prev.map((r) => r.id))
      return [...prev, ...(data ?? []).filter((r) => !known.has(r.id))]
    })
    if (count != null) setTotal(count)
  }

  useEffect(() => {
    loadRecords()
  }, [])

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { data, error: insertError } = await createThoughtRecord({ userId: user.id, ...form })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setRecords((prev) => [data, ...prev])
    setTotal((t) => (t == null ? t : t + 1))
    setForm(emptyForm)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2500)
  }

  async function confirmDelete() {
    const { error: deleteError } = await deleteThoughtRecord(pendingDelete.id)

    if (deleteError) {
      setError(deleteError.message)
      setPendingDelete(null)
      return
    }

    setRecords((prev) => prev.filter((r) => r.id !== pendingDelete.id))
    setTotal((t) => (t == null ? t : Math.max(0, t - 1)))
    setPendingDelete(null)
  }

  async function copyRecord(record) {
    await navigator.clipboard.writeText(recordToText(record))
    setCopiedId(record.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Section 04</p>
          <h1 className="folio-title">
            Case <em>notes</em>
          </h1>
          <p className="folio-standfirst">
            The CBT thought record, set out as a form you fill in from the top: what happened, what
            you told yourself, and what actually holds up.
          </p>
        </div>
        <div className="folio-meta">
          <span>
            <b>{total ?? records.length}</b> on file
          </span>
          <span>Confidential</span>
        </div>
      </Reveal>

      <FormError message={error} label="Case notes" />

      <Reveal as="form" className="panel" index={1} onSubmit={handleSubmit}>
        <div className="panel-head">
          <span className="panel-head-num">§ 01</span>
          <h2>New record</h2>
          <span className="panel-head-note">Seven fields · two required</span>
        </div>

        <div className="field">
          <label htmlFor="situation">
            <span className="field-num">01</span> The situation
          </label>
          <textarea
            id="situation"
            required
            rows={2}
            placeholder="Where you were and what happened."
            value={form.situation}
            onChange={(e) => updateField('situation', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="automatic_thought">
            <span className="field-num">02</span> The automatic thought
          </label>
          <textarea
            id="automatic_thought"
            required
            rows={2}
            placeholder="The sentence that arrived on its own."
            value={form.automatic_thought}
            onChange={(e) => updateField('automatic_thought', e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="emotion">
              <span className="field-num">03</span> Emotion
            </label>
            <input
              id="emotion"
              type="text"
              placeholder="anxious"
              value={form.emotion}
              onChange={(e) => updateField('emotion', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="intensity">
              <span className="field-num">04</span> Strength (1–10)
            </label>
            <input
              id="intensity"
              type="number"
              min={1}
              max={10}
              value={form.emotion_intensity}
              onChange={(e) => updateField('emotion_intensity', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="evidence_for">
            <span className="field-num">05</span> Evidence for it
          </label>
          <textarea
            id="evidence_for"
            rows={2}
            placeholder="Facts, not feelings."
            value={form.evidence_for}
            onChange={(e) => updateField('evidence_for', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="evidence_against">
            <span className="field-num">06</span> Evidence against it
          </label>
          <textarea
            id="evidence_against"
            rows={2}
            placeholder="What a fair witness would point out."
            value={form.evidence_against}
            onChange={(e) => updateField('evidence_against', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="balanced_thought">
            <span className="field-num">07</span> The balanced thought
          </label>
          <textarea
            id="balanced_thought"
            rows={2}
            placeholder="What you'd tell a friend in the same spot."
            value={form.balanced_thought}
            onChange={(e) => updateField('balanced_thought', e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn--solid">
          <Icon name="quill" size={15} />
          File this record
        </button>
        <FormSuccess visible={showSuccess} message="Filed." />
      </Reveal>

      <Reveal as="section" index={2}>
        <div className="panel-head" style={{ borderBottomColor: 'var(--text)' }}>
          <span className="panel-head-num">§ 02</span>
          <h2>On file</h2>
          <span className="panel-head-note">Newest first</span>
        </div>

        {loading ? (
          <div className="ruled-skeleton ruled-skeleton--list" />
        ) : records.length === 0 ? (
          <p className="empty-state">No records filed yet.</p>
        ) : (
          <StaggerGroup className="note-list" base={0.04}>
            {records.map((r, i) => (
              <StaggerItem className="note" index={i} key={r.id}>
                <div className="note-head">
                  <h3>{r.situation}</h3>
                  <span className="note-date">
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <dl style={{ margin: 0 }}>
                  <div className="note-line">
                    <dt>Thought</dt>
                    <dd className="note-quote">"{r.automatic_thought}"</dd>
                  </div>
                  {r.emotion && (
                    <div className="note-line">
                      <dt>Emotion</dt>
                      <dd>
                        <Intensity value={r.emotion_intensity} /> {r.emotion}
                      </dd>
                    </div>
                  )}
                  {r.balanced_thought && (
                    <div className="note-line">
                      <dt>Rebalanced</dt>
                      <dd className="note-balanced">{r.balanced_thought}</dd>
                    </div>
                  )}
                </dl>

                <div className="note-actions">
                  <button type="button" className="btn btn--quiet btn--sm" onClick={() => copyRecord(r)}>
                    <Icon name="copy" size={13} />
                    {copiedId === r.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--sm"
                    onClick={() => setPendingDelete(r)}
                  >
                    <Icon name="trash" size={13} />
                    Delete
                  </button>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}

        {!loading && total != null && records.length < total && (
          <div className="brief-actions">
            <button type="button" className="btn btn--quiet" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Fetching…' : `Show ${Math.min(PAGE_SIZE, total - records.length)} more`}
            </button>
            <span className="panel-note" aria-live="polite">
              Showing {records.length} of {total}
            </span>
          </div>
        )}
      </Reveal>

      <ConfirmModal
        open={!!pendingDelete}
        slug="Destroy record"
        title="Delete this record?"
        message="The record is removed permanently. This can't be undone."
        confirmLabel="Delete it"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
