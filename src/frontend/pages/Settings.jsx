import { useState } from 'react'
import { exportAllData, deleteAllData } from '@backend/services/account'
import { useAuth } from '@backend/auth/AuthContext'
import AppearanceSettings from '@design/theme/AppearanceSettings'
import { getConsent, applyConsentChoice } from '@backend/utils/consent'
import { getMoodHistoryLength, setMoodHistoryLength } from '@shared/utils/preferences'
import PasswordInput from '@frontend/components/PasswordInput'
import FormSuccess from '@frontend/components/FormSuccess'
import FormError from '@frontend/components/FormError'
import ConfirmModal from '@frontend/components/ConfirmModal'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

// A two-state printed switch. Both states stay visible so the setting reads
// as a choice between two named options rather than an on/off you have to
// toggle to discover.
function Switch({ label, options, value, onChange }) {
  return (
    <div className="switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function Settings() {
  const { user, signOut, updatePassword } = useAuth()

  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState(null)

  const [historyLength, setHistoryLength] = useState(getMoodHistoryLength)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const [pendingDeleteData, setPendingDeleteData] = useState(false)
  const [deletingData, setDeletingData] = useState(false)
  const [dataDeleted, setDataDeleted] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const [consent, setConsentState] = useState(getConsent)

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err.message)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSaving(true)
    try {
      await updatePassword(newPassword)
      setNewPassword('')
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 2500)
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  function handleHistoryChange(e) {
    const value = Number(e.target.value)
    setHistoryLength(value)
    setMoodHistoryLength(value)
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)

    const { data, error } = await exportAllData(user.id)
    if (error) {
      setExportError(error.message)
      setExporting(false)
      return
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mindful-export-${todayStamp()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  async function confirmDeleteAllData() {
    setDeletingData(true)
    setDeleteError(null)

    const { error } = await deleteAllData(user.id)

    setDeletingData(false)
    setPendingDeleteData(false)
    if (error) {
      setDeleteError(error.message)
      return
    }
    setDataDeleted(true)
  }

  function handleConsentChoice(choice) {
    applyConsentChoice(choice)
    setConsentState(choice)
  }

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Section 06</p>
          <h1 className="folio-title">
            House <em>rules</em>
          </h1>
          <p className="folio-standfirst">
            How the book is set, who you are to it, and what happens to everything you've written.
          </p>
        </div>
        <div className="folio-meta">
          <span>
            Signed in as <b>{user?.email}</b>
          </span>
        </div>
      </Reveal>

      <StaggerGroup base={0.05}>
        <StaggerItem className="panel" index={0}>
          <div className="panel-head">
            <span className="panel-head-num">§ 01</span>
            <h2>Setting &amp; impression</h2>
          </div>

          <AppearanceSettings Switch={Switch} />
        </StaggerItem>

        <StaggerItem className="panel" index={1}>
          <div className="panel-head">
            <span className="panel-head-num">§ 02</span>
            <h2>Your account</h2>
          </div>

          <form onSubmit={handlePasswordChange} className="settings-form">
            <FormError message={passwordError} label="Password" />
            <PasswordInput
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <button type="submit" className="btn btn--ink" disabled={passwordSaving}>
              <Icon name="lock" size={14} />
              {passwordSaving ? 'Saving…' : 'Change password'}
            </button>
            <FormSuccess visible={passwordSuccess} message="Password updated." />
          </form>

          <div className="ledger">
            <div className="ledger-row">
              <div className="ledger-label">
                <strong>Close the book</strong>
                <p>End your session on this device.</p>
              </div>
              <button type="button" className="btn btn--quiet btn--sm" onClick={handleSignOut}>
                <Icon name="exit" size={14} />
                Sign out
              </button>
            </div>
          </div>
        </StaggerItem>

        <StaggerItem className="panel" index={2}>
          <div className="panel-head">
            <span className="panel-head-num">§ 03</span>
            <h2>What's on file</h2>
          </div>

          <div className="ledger">
            <div className="ledger-row">
              <div className="ledger-label">
                <strong>Chart history</strong>
                <p>How many recent mood entries the trend line loads.</p>
              </div>
              <select value={historyLength} onChange={handleHistoryChange} aria-label="Chart history length">
                <option value={30}>Last 30</option>
                <option value={60}>Last 60</option>
                <option value={90}>Last 90</option>
              </select>
            </div>

            <div className="ledger-row">
              <div className="ledger-label">
                <strong>Take a copy</strong>
                <p>Download every mood, habit, check-in, and record as one JSON file.</p>
              </div>
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                onClick={handleExport}
                disabled={exporting}
              >
                <Icon name="download" size={14} />
                {exporting ? 'Preparing…' : 'Export'}
              </button>
            </div>

            <div className="ledger-row">
              <div className="ledger-label">
                <strong>Burn the pages</strong>
                <p>
                  Clears every mood log, habit, and thought record. It does not delete the account
                  itself — that needs server-side access this app's Supabase key doesn't have.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => setPendingDeleteData(true)}
              >
                <Icon name="trash" size={14} />
                Delete data
              </button>
            </div>
          </div>

          <FormError message={exportError} label="Export" />
          <FormError message={deleteError} label="Delete" />
          <FormSuccess visible={dataDeleted} message="Everything has been cleared." />
        </StaggerItem>

        <StaggerItem className="panel" index={3}>
          <div className="panel-head">
            <span className="panel-head-num">§ 04</span>
            <h2>Privacy</h2>
            <span className="panel-head-note">
              <Icon name="shield" size={13} /> Row-level security
            </span>
          </div>

          <div className="ledger">
            <div className="ledger-row">
              <div className="ledger-label">
                <strong>Local storage</strong>
                <p>
                  Currently{' '}
                  {consent === 'accepted'
                    ? 'accepted'
                    : consent === 'declined'
                      ? 'declined'
                      : 'not yet set'}
                  . Declining also clears any campaign parameters captured at boot.
                </p>
              </div>
              <Switch
                label="Storage preference"
                value={consent ?? ''}
                onChange={handleConsentChoice}
                options={[
                  { value: 'declined', label: 'Decline' },
                  { value: 'accepted', label: 'Accept' },
                ]}
              />
            </div>
          </div>
        </StaggerItem>
      </StaggerGroup>

      <ConfirmModal
        open={pendingDeleteData}
        slug="Irreversible"
        title="Delete everything you've written?"
        message="This permanently removes every mood log, habit, check-in, and thought record. There is no undo, and no copy kept."
        confirmLabel={deletingData ? 'Deleting…' : 'Delete it all'}
        onConfirm={confirmDeleteAllData}
        onCancel={() => setPendingDeleteData(false)}
      />
    </div>
  )
}
