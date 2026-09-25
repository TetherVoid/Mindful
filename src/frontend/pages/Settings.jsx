import { useState } from 'react'
import { deactivateMyAccount, exportAllData, deleteAccount, deleteAllData } from '@backend/services/account'
import { updateMyProfile } from '@backend/services/profile'
import { useAuth } from '@backend/auth/AuthContext'
import AppearanceSettings from '@design/theme/AppearanceSettings'
import { getConsent, applyConsentChoice } from '@backend/utils/consent'
import { STORAGE_KEYS } from '@shared/constants/storage'
import { getMoodHistoryLength, setMoodHistoryLength } from '@shared/utils/preferences'
import PasswordInput from '@frontend/components/PasswordInput'
import FormSuccess from '@frontend/components/FormSuccess'
import FormError from '@frontend/components/FormError'
import ConfirmModal from '@frontend/components/ConfirmModal'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'

function Switch({ label, options, value, onChange, disabled = false }) { return <div className="switch" role="group" aria-label={label}>{options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(o.value)}>{o.label}</button>)}</div> }
const stamp = () => new Date().toISOString().slice(0, 10)

// The wording for each confirmable action, keyed by the value `confirm` holds.
// Four actions with different consequences had grown into a four-deep ternary
// per prop; a table makes it possible to read one action's copy in one place.
const CONFIRMATIONS = {
  local: {
    slug: 'Local device only',
    title: 'Clear local data from this device?',
    message: 'You will need to set your visual and privacy preferences again.',
    confirmLabel: 'Clear local data',
  },
  data: {
    slug: 'Irreversible',
    title: 'Delete everything you have written?',
    message: 'This permanently removes your mood logs, habits, check-ins, and thought records.',
    confirmLabel: 'Delete data',
  },
  deactivate: {
    slug: 'One way',
    title: 'Deactivate your account?',
    message:
      'Your entries are kept but you lose access to them, and you are removed from your classes. Only an administrator can switch the account back on — you cannot do it yourself. You will be signed out.',
    confirmLabel: 'Deactivate account',
  },
  account: {
    slug: 'Irreversible',
    title: 'Delete your account permanently?',
    message: 'This permanently removes your account and all related data.',
    confirmLabel: 'Delete account',
  },
}

export default function Settings() {
  const { user, profile, role, signOut, updatePassword, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [share, setShare] = useState(profile?.share_with_teachers ? 'yes' : 'no')
  // The profile arrives a moment after this page mounts, so the two states
  // above start from `null` — which reads as "Private" whatever the user
  // actually chose. Left alone, a save made in that moment writes
  // share_with_teachers = false and silently revokes consent the user had
  // given. Two things stop that: the control is disabled until the profile is
  // here (below), and saveProfile omits the field entirely rather than sending
  // a guess (updateMyProfile treats `undefined` as "leave it alone").
  //
  // The sync happens during render rather than in an effect, and it is keyed on
  // the profile's id rather than on the object: refreshProfile() hands back a
  // new object every time it runs, so syncing on identity would overwrite
  // whatever the user had typed since. Keyed on the id it runs exactly once per
  // signed-in account — when the profile first arrives — which is the only
  // moment there is anything to catch up on.
  const profileLoaded = Boolean(profile)
  const [syncedProfileId, setSyncedProfileId] = useState(null)
  if (profile && syncedProfileId !== profile.id) {
    setSyncedProfileId(profile.id)
    setDisplayName(profile.display_name ?? '')
    setShare(profile.share_with_teachers ? 'yes' : 'no')
  }
  const [password, setPassword] = useState(''); const [history, setHistory] = useState(getMoodHistoryLength); const [consent, setConsent] = useState(getConsent)
  const [busy, setBusy] = useState(null); const [error, setError] = useState(null); const [success, setSuccess] = useState(null); const [confirm, setConfirm] = useState(null)
  const notify = (message) => { setSuccess(message); window.setTimeout(() => setSuccess(null), 3000) }
  const fail = (message) => { setError(message); setBusy(null) }
  async function saveProfile(e) { e.preventDefault(); setBusy('profile'); setError(null); const { error: err } = await updateMyProfile({ displayName, shareWithTeachers: profileLoaded ? share === 'yes' : undefined }); if (err) return fail(err.message); await refreshProfile(); setBusy(null); notify('Account details saved.') }
  async function savePassword(e) { e.preventDefault(); setBusy('password'); setError(null); try { await updatePassword(password); setPassword(''); notify('Password updated.') } catch (err) { setError(err.message) } finally { setBusy(null) } }
  async function exportData() { setBusy('export'); setError(null); const { data, error: err } = await exportAllData(user?.id); if (err) return fail(err.message); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `mindful-export-${stamp()}.json`; link.click(); URL.revokeObjectURL(url); setBusy(null); notify('Your export has downloaded.') }
  // Deactivation signs the user out itself. The session stays technically valid
  // until it is next used, and every owner policy now refuses the account, so
  // leaving it open would mean a page of errors rather than a clean exit. A
  // sign-out that fails is not worth reporting as a failed deactivation — the
  // deactivation succeeded — so it is logged and swallowed.
  async function runConfirmed() { const action = confirm; setBusy(action); setError(null); if (action === 'data') { const { error: err } = await deleteAllData(user?.id); if (err) return fail(err.message); notify('Your written data has been cleared.') } if (action === 'account') { const { error: err } = await deleteAccount(); if (err) return fail(err.message) } if (action === 'deactivate') { const { error: err } = await deactivateMyAccount(); if (err) return fail(err.message); setConfirm(null); try { await signOut() } catch (err) { console.warn('[settings] sign-out after deactivation failed:', err?.message) } return } if (action === 'local') { Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key)); setConsent(null); notify('Local preferences and campaign data cleared.') } setBusy(null); setConfirm(null) }
  async function leave() { setBusy('signout'); try { await signOut() } catch (err) { fail(err.message) } }
  const roleLabel = role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Teacher' : 'Student'
  return <div className="folio">
    <Reveal as="header" className="folio-head" y={14} index={0}><div><p className="folio-kicker">Section 06</p><h1 className="folio-title">House <em>rules</em></h1><p className="folio-standfirst">Your account, privacy choices, and the book on this device.</p></div><div className="folio-meta"><span>Signed in as <b>{user?.email}</b></span><span>{roleLabel}</span></div></Reveal>
    <FormError message={error} label="Settings" /><FormSuccess visible={Boolean(success)} message={success} />
    <StaggerGroup base={0.05}>
      <StaggerItem className="panel" index={0}><div className="panel-head"><span className="panel-head-num">§ 01</span><h2>Profile &amp; visibility</h2></div><form className="settings-form" onSubmit={saveProfile}><div className="field"><label htmlFor="display-name">Display name</label><input id="display-name" value={displayName} maxLength={120} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" /></div>{role === 'student' && <div className="ledger"><div className="ledger-row"><div className="ledger-label"><strong>Share figures with teachers</strong><p>When this is on, the teachers of your classes and the school’s administrators can see figures about your record — counts, your average, each day’s scores, and when you last wrote. Never your words: not your notes, your thought records or your habit names. Off until you choose otherwise.</p></div><Switch label="Teacher visibility" value={share} onChange={setShare} disabled={!profileLoaded} options={[{ value: 'no', label: 'Private' }, { value: 'yes', label: 'Share figures' }]} /></div></div>}{role === 'student' && !profileLoaded && <p className="panel-note">Loading your current choice…</p>}<button type="submit" className="btn btn--ink" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button></form></StaggerItem>
      <StaggerItem className="panel" index={1}><div className="panel-head"><span className="panel-head-num">§ 02</span><h2>Appearance</h2></div><AppearanceSettings Switch={Switch} /></StaggerItem>
      <StaggerItem className="panel" index={2}><div className="panel-head"><span className="panel-head-num">§ 03</span><h2>Security &amp; session</h2></div><form onSubmit={savePassword} className="settings-form"><PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" /><button type="submit" className="btn btn--ink" disabled={busy === 'password'}><Icon name="lock" size={14} />{busy === 'password' ? 'Saving…' : 'Change password'}</button></form><div className="ledger"><div className="ledger-row"><div className="ledger-label"><strong>Close the book</strong><p>Sign out of this device. Other sessions remain active.</p></div><button type="button" className="btn btn--quiet btn--sm" onClick={leave} disabled={busy === 'signout'}><Icon name="exit" size={14} />{busy === 'signout' ? 'Signing out…' : 'Sign out'}</button></div></div></StaggerItem>
      <StaggerItem className="panel" index={3}><div className="panel-head"><span className="panel-head-num">§ 04</span><h2>Data &amp; privacy</h2></div><div className="ledger"><div className="ledger-row"><div className="ledger-label"><strong>Chart history</strong><p>How many recent mood entries the trend line loads.</p></div><select value={history} onChange={(e) => { const n = Number(e.target.value); setHistory(n); setMoodHistoryLength(n) }} aria-label="Chart history length"><option value={30}>Last 30</option><option value={60}>Last 60</option><option value={90}>Last 90</option></select></div><div className="ledger-row"><div className="ledger-label"><strong>Take a copy</strong><p>Download your mood, habit, check-in, and thought-record data as JSON.</p></div><button type="button" className="btn btn--quiet btn--sm" onClick={exportData} disabled={busy === 'export'}><Icon name="download" size={14} />{busy === 'export' ? 'Preparing…' : 'Export'}</button></div><div className="ledger-row"><div className="ledger-label"><strong>Local storage</strong><p>Currently {consent ?? 'not yet set'}.</p></div><Switch label="Storage preference" value={consent ?? ''} onChange={(choice) => { applyConsentChoice(choice); setConsent(choice); notify(`Local storage preference set to ${choice}.`) }} options={[{ value: 'declined', label: 'Decline' }, { value: 'accepted', label: 'Accept' }]} /></div><div className="ledger-row"><div className="ledger-label"><strong>Clear this device</strong><p>Remove local appearance, chart, consent, and campaign preferences. Cloud data stays intact.</p></div><button type="button" className="btn btn--quiet btn--sm" onClick={() => setConfirm('local')}><Icon name="trash" size={14} />Clear local data</button></div></div></StaggerItem>
      <StaggerItem className="panel" index={4}><div className="panel-head"><span className="panel-head-num">§ 05</span><h2>Permanent actions</h2></div><div className="ledger"><div className="ledger-row"><div className="ledger-label"><strong>Delete written data</strong><p>Remove moods, habits, check-ins, and thought records. Your account remains open.</p></div><button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirm('data')}><Icon name="trash" size={14} />Delete data</button></div><div className="ledger-row"><div className="ledger-label"><strong>Deactivate my account</strong><p>Switch the account off and keep everything you have written. You lose access to it and leave your classes. Only an administrator can switch it back on.</p></div><button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirm('deactivate')}><Icon name="lock" size={14} />Deactivate</button></div><div className="ledger-row"><div className="ledger-label"><strong>Delete account</strong><p>Permanently delete your account and all related data. This cannot be undone.</p></div><button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirm('account')}><Icon name="trash" size={14} />Delete account</button></div></div></StaggerItem>
    </StaggerGroup>
    <ConfirmModal open={Boolean(confirm)} slug={CONFIRMATIONS[confirm]?.slug ?? 'Confirmation required'} title={CONFIRMATIONS[confirm]?.title ?? ''} message={CONFIRMATIONS[confirm]?.message ?? ''} confirmLabel={busy ? 'Working…' : CONFIRMATIONS[confirm]?.confirmLabel ?? 'Confirm'} confirmDisabled={Boolean(busy)} onConfirm={runConfirmed} onCancel={() => !busy && setConfirm(null)} />
  </div>
}
