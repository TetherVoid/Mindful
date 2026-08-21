import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getConsent, applyConsentChoice } from '../lib/consent'
import { getMoodHistoryLength, setMoodHistoryLength } from '../lib/preferences'
import ThemeColorSwatches from '../components/ThemeColorSwatches'
import PasswordInput from '../components/PasswordInput'
import FormSuccess from '../components/FormSuccess'
import ConfirmModal from '../components/ConfirmModal'

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

export default function Settings() {
  const { user, signOut, updatePassword } = useAuth()
  const { theme, toggleTheme, density, setDensity, reduceMotion, setReduceMotion } = useTheme()

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
    const [{ data: moods, error: e1 }, { data: habits, error: e2 }, { data: habitLogs, error: e3 }, { data: thoughts, error: e4 }] =
      await Promise.all([
        supabase.from('mood_logs').select('*').eq('user_id', user.id),
        supabase.from('habits').select('*').eq('user_id', user.id),
        supabase.from('habit_logs').select('*').eq('user_id', user.id),
        supabase.from('thought_records').select('*').eq('user_id', user.id),
      ])

    const firstError = e1 ?? e2 ?? e3 ?? e4
    if (firstError) {
      setExportError(firstError.message)
      setExporting(false)
      return
    }

    const payload = {
      exported_at: new Date().toISOString(),
      mood_logs: moods ?? [],
      habits: habits ?? [],
      habit_logs: habitLogs ?? [],
      thought_records: thoughts ?? [],
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
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
    const results = await Promise.all([
      supabase.from('mood_logs').delete().eq('user_id', user.id),
      supabase.from('habit_logs').delete().eq('user_id', user.id),
      supabase.from('habits').delete().eq('user_id', user.id),
      supabase.from('thought_records').delete().eq('user_id', user.id),
    ])
    const firstError = results.map((r) => r.error).find(Boolean)
    setDeletingData(false)
    setPendingDeleteData(false)
    if (firstError) {
      setDeleteError(firstError.message)
      return
    }
    setDataDeleted(true)
  }

  function handleConsentChoice(choice) {
    applyConsentChoice(choice)
    setConsentState(choice)
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="page-intro">Appearance, account, data, and privacy — all in one place.</p>

      <div className="card">
        <h2>Appearance</h2>

        <div className="settings-row">
          <div>
            <strong>Theme</strong>
            <p className="settings-row-desc">Switch between light and dark mode.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>Layout density</strong>
            <p className="settings-row-desc">Tighter spacing and smaller padding throughout.</p>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
          >
            {density === 'compact' ? 'Compact' : 'Comfortable'}
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>Reduce motion</strong>
            <p className="settings-row-desc">
              Turn off animations and transitions, independent of your system setting.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setReduceMotion(!reduceMotion)}>
            {reduceMotion ? 'On' : 'Off'}
          </button>
        </div>

        <div className="settings-row settings-row-column">
          <div>
            <strong>Theme color</strong>
            <p className="settings-row-desc">
              Pick a color and the whole site — background, text, accent, shadows — recolors to
              match.
            </p>
          </div>
          <ThemeColorSwatches />
        </div>
      </div>

      <div className="card">
        <h2>Account</h2>
        <div className="settings-row">
          <div>
            <strong>Email</strong>
            <p className="settings-row-desc">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="settings-subform">
          {passwordError && <div className="form-error">{passwordError}</div>}
          <PasswordInput
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <button type="submit" className="btn-primary" disabled={passwordSaving}>
            {passwordSaving ? 'Saving…' : 'Change password'}
          </button>
          <FormSuccess visible={passwordSuccess} message="Password updated." />
        </form>

        <div className="settings-row">
          <div>
            <strong>Sign out</strong>
            <p className="settings-row-desc">End your session on this device.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Data</h2>

        <div className="settings-row">
          <div>
            <strong>Mood chart history</strong>
            <p className="settings-row-desc">How many recent entries the trend chart loads.</p>
          </div>
          <select value={historyLength} onChange={handleHistoryChange}>
            <option value={30}>Last 30</option>
            <option value={60}>Last 60</option>
            <option value={90}>Last 90</option>
          </select>
        </div>

        <div className="settings-row">
          <div>
            <strong>Export your data</strong>
            <p className="settings-row-desc">Download everything you've logged as a JSON file.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
        {exportError && <div className="form-error">{exportError}</div>}

        <div className="settings-row">
          <div>
            <strong>Delete all my data</strong>
            <p className="settings-row-desc">
              Clears every mood log, habit, and thought record. This does not delete your
              account — real account deletion needs a step we haven't built yet, since it
              requires server-side access this app's Supabase key doesn't have.
            </p>
          </div>
          <button type="button" className="btn-danger" onClick={() => setPendingDeleteData(true)}>
            Delete data
          </button>
        </div>
        {deleteError && <div className="form-error">{deleteError}</div>}
        <FormSuccess visible={dataDeleted} message="All data deleted." />
      </div>

      <div className="card">
        <h2>Privacy</h2>
        <div className="settings-row">
          <div>
            <strong>Cookie preference</strong>
            <p className="settings-row-desc">
              Currently: {consent === 'accepted' ? 'Accepted' : consent === 'declined' ? 'Declined' : 'Not set'}
            </p>
          </div>
          <div className="settings-toggle-group">
            <button type="button" className="btn-ghost" onClick={() => handleConsentChoice('declined')}>
              Decline
            </button>
            <button type="button" className="btn-primary" onClick={() => handleConsentChoice('accepted')}>
              Accept
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={pendingDeleteData}
        title="Delete all your data?"
        message="This permanently removes every mood log, habit, habit check-in, and thought record. This can't be undone."
        confirmLabel={deletingData ? 'Deleting…' : 'Delete everything'}
        onConfirm={confirmDeleteAllData}
        onCancel={() => setPendingDeleteData(false)}
      />
    </div>
  )
}
