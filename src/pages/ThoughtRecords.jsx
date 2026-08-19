import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ConfirmModal from '../components/ConfirmModal'
import FormSuccess from '../components/FormSuccess'

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

export default function ThoughtRecords() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    loadRecords()
  }, [])

  async function loadRecords() {
    setLoading(true)
    const { data } = await supabase
      .from('thought_records')
      .select('*')
      .order('created_at', { ascending: false })
    setRecords(data ?? [])
    setLoading(false)
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await supabase.from('thought_records').insert({ user_id: user.id, ...form })
    setForm(emptyForm)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2500)
    loadRecords()
  }

  async function confirmDelete() {
    await supabase.from('thought_records').delete().eq('id', pendingDelete.id)
    setPendingDelete(null)
    loadRecords()
  }

  async function copyRecord(record) {
    await navigator.clipboard.writeText(recordToText(record))
    setCopiedId(record.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="page">
      <h1>Thought Records</h1>
      <p className="page-intro">
        A CBT exercise: capture a situation, the automatic thought it triggered, and work toward
        a more balanced perspective.
      </p>

      <form className="card thought-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="situation">Situation</label>
          <textarea
            id="situation"
            required
            rows={2}
            value={form.situation}
            onChange={(e) => updateField('situation', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="automatic_thought">Automatic thought</label>
          <textarea
            id="automatic_thought"
            required
            rows={2}
            value={form.automatic_thought}
            onChange={(e) => updateField('automatic_thought', e.target.value)}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="emotion">Emotion</label>
            <input
              id="emotion"
              type="text"
              placeholder="e.g. anxious"
              value={form.emotion}
              onChange={(e) => updateField('emotion', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="intensity">Intensity (1–10)</label>
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
          <label htmlFor="evidence_for">Evidence for the thought</label>
          <textarea
            id="evidence_for"
            rows={2}
            value={form.evidence_for}
            onChange={(e) => updateField('evidence_for', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="evidence_against">Evidence against the thought</label>
          <textarea
            id="evidence_against"
            rows={2}
            value={form.evidence_against}
            onChange={(e) => updateField('evidence_against', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="balanced_thought">Balanced thought</label>
          <textarea
            id="balanced_thought"
            rows={2}
            value={form.balanced_thought}
            onChange={(e) => updateField('balanced_thought', e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          Save record
        </button>
        <FormSuccess visible={showSuccess} message="Thought record saved." />
      </form>

      <h2>Past records</h2>
      {loading ? (
        <div className="skeleton skeleton-list" />
      ) : records.length === 0 ? (
        <p className="empty-state">No thought records yet.</p>
      ) : (
        <div className="record-list">
          {records.map((r) => (
            <div className="card record-card" key={r.id}>
              <div className="record-header">
                <strong>{r.situation}</strong>
                <span className="record-date">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="record-thought">"{r.automatic_thought}"</p>
              {r.balanced_thought && (
                <p className="record-balanced">Balanced: {r.balanced_thought}</p>
              )}
              <div className="record-actions">
                <button type="button" className="btn-ghost" onClick={() => copyRecord(r)}>
                  {copiedId === r.id ? 'Copied!' : 'Copy'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setPendingDelete(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        title="Delete this record?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
