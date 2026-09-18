import { useCallback, useEffect, useState } from 'react'
import { adminListUsers, listRoleChanges, ROLES, setAccountActive, setUserRole } from '@backend/services/profile'
import { useAuth } from '@backend/auth/AuthContext'
import ConfirmModal from '@frontend/components/ConfirmModal'
import FormError from '@frontend/components/FormError'
import FormSuccess from '@frontend/components/FormSuccess'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'

// The administrator's desk.
//
// Every control here is refused by the database for anybody who is not an
// administrator: admin_list_users(), set_user_role() and set_account_active()
// each check is_admin() as their first statement and raise 42501 otherwise. The
// route guard in app/App.jsx hides the page rather than protecting it — a user
// who types /admin sees nothing they could not already have called by hand, and
// what they would get back is an error from Postgres.
//
// What the page deliberately does not offer: deleting another person's account.
// Suspension is the administrative operation because it is reversible, and a
// deleted account cannot be un-deleted when the decision turns out to have been
// wrong. See supabase/SECURITY.md.

const PAGE_SIZE = 25

const ROLE_OPTIONS = [
  { value: ROLES.student, label: 'Student' },
  { value: ROLES.teacher, label: 'Teacher' },
  { value: ROLES.admin, label: 'Administrator' },
]

const roleLabel = (value) => ROLE_OPTIONS.find((option) => option.value === value)?.label ?? value

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—')

export default function Admin() {
  const { user } = useAuth()

  const [search, setSearch] = useState('')
  // The term the current page was fetched with, as opposed to what is in the
  // box. Typing should not re-run the query on every keystroke — each one is a
  // round trip that reads auth.users — so the two are separate and the form
  // submit is what moves one to the other.
  const [activeSearch, setActiveSearch] = useState('')
  const [page, setPage] = useState(0)

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [history, setHistory] = useState(null)
  const [pending, setPending] = useState(null)

  const notify = (message) => {
    setSuccess(message)
    window.setTimeout(() => setSuccess(null), 3000)
  }

  // Fetching and applying are separate so the effect below sets no state until
  // the answer arrives, and so the same pair can be reused after a change is
  // made without a second copy of the query.
  //
  // `loading` is turned ON by whichever event is about to change the query — the
  // search submit, or a page button — rather than by the effect: the event
  // already knows a request is coming, and raising it in the effect would be a
  // re-render that carries no new information.
  const fetchPage = useCallback(
    () => adminListUsers({ search: activeSearch, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [activeSearch, page]
  )

  const applyPage = useCallback(({ data, error: err }) => {
    setLoading(false)
    if (err) return setError(err.message)
    setError(null)
    setUsers(data ?? [])
  }, [])

  useEffect(() => {
    let active = true
    void fetchPage().then((result) => {
      if (active) applyPage(result)
    })
    // A search that is superseded while in flight must not overwrite the newer
    // one's results, which arriving out of order would otherwise let it do.
    return () => { active = false }
  }, [fetchPage, applyPage])

  function runSearch(e) {
    e.preventDefault()
    setLoading(true)
    // Back to the first page: an offset that made sense for one term is
    // meaningless for another, and page 3 of a new search is usually empty.
    setPage(0)
    setActiveSearch(search)
  }

  function goToPage(next) {
    setLoading(true)
    setPage(next)
  }

  async function openHistory(target) {
    setBusy(`history-${target.id}`)
    setError(null)
    const { data, error: err } = await listRoleChanges(target.id)
    setBusy(null)
    if (err) return setError(err.message)
    setHistory({ user: target, entries: data ?? [] })
  }

  async function runPending() {
    if (!pending) return
    setBusy('confirm')
    setError(null)

    const { error: err } =
      pending.kind === 'role'
        ? await setUserRole({ userId: pending.user.id, role: pending.role })
        : await setAccountActive({ userId: pending.user.id, active: pending.active })

    setBusy(null)
    if (err) return setError(err.message)

    setPending(null)
    notify(
      pending.kind === 'role'
        ? `${pending.user.email} is now a ${roleLabel(pending.role).toLowerCase()}.`
        : pending.active
          ? `${pending.user.email} has been reactivated.`
          : `${pending.user.email} has been deactivated.`
    )
    // Re-read rather than patching the row in place: set_user_role() can refuse
    // a change the page thought was fine (the last administrator, for one), and
    // set_account_active() clears class memberships as a side effect. The
    // server's answer is the one worth showing.
    applyPage(await fetchPage())
    if (history?.user.id === pending.user.id) await openHistory(pending.user)
  }

  // There is no total count to page against — admin_list_users() returns a page
  // and nothing else — so "there is a next page" is inferred from this one being
  // full. A last page holding exactly PAGE_SIZE rows shows a Next that lands on
  // an empty page, which is a smaller lie than hiding a page that exists.
  const hasNextPage = users.length === PAGE_SIZE

  const confirmCopy = !pending
    ? null
    : pending.kind === 'role'
      ? {
          slug: 'Recorded in the audit log',
          title: `Make ${pending.user.email} a ${roleLabel(pending.role).toLowerCase()}?`,
          message:
            pending.role === ROLES.admin
              ? 'An administrator can read every account’s email address, change anyone’s role, and suspend accounts. This change is written to the role-change audit.'
              : 'The change takes effect on their next request and is written to the role-change audit.',
          confirmLabel: 'Change role',
        }
      : pending.active
        ? {
            slug: 'Reversible',
            title: `Reactivate ${pending.user.email}?`,
            message: 'They regain access to their own entries. Class memberships are not restored — they will need to join again with a code.',
            confirmLabel: 'Reactivate',
          }
        : {
            slug: 'Reversible',
            title: `Deactivate ${pending.user.email}?`,
            message: 'Everything they have written is kept, and they lose access to all of it until an administrator switches the account back on. They are removed from their classes.',
            confirmLabel: 'Deactivate',
          }

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Section 08</p>
          <h1 className="folio-title">The <em>register of hands</em></h1>
          <p className="folio-standfirst">
            Who holds which role, and whose account is open. This is a directory — it shows names,
            addresses and roles, and nothing anybody wrote.
          </p>
        </div>
        <div className="folio-meta">
          <span>Administrator</span>
        </div>
      </Reveal>

      <FormError message={error} label="Administration" />
      <FormSuccess visible={Boolean(success)} message={success} />

      <StaggerGroup base={0.05}>
        <StaggerItem className="panel" index={0}>
          <div className="panel-head">
            <span className="panel-head-num">§ 01</span>
            <h2>Find a user</h2>
          </div>
          <form className="settings-form" onSubmit={runSearch}>
            <div className="field">
              <label htmlFor="admin-search">Email or display name</label>
              <input
                id="admin-search"
                value={search}
                maxLength={200}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Leave empty to list everyone"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="btn btn--solid" disabled={loading}>
              <Icon name="search" size={15} />
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
        </StaggerItem>

        <StaggerItem className="panel" index={1}>
          <div className="panel-head">
            <span className="panel-head-num">§ 02</span>
            <h2>{activeSearch ? `Matching “${activeSearch}”` : 'All accounts'}</h2>
          </div>

          {loading ? (
            <div className="ruled-skeleton ruled-skeleton--table" />
          ) : users.length === 0 ? (
            <p className="empty-state">
              {activeSearch
                ? 'No account matches that search.'
                : page > 0
                  ? 'There is nothing on this page.'
                  : 'There are no accounts yet.'}
            </p>
          ) : (
            <div className="ledger">
              {users.map((row) => {
                const isSelf = row.id === user?.id
                return (
                  <div className="ledger-row" key={row.id}>
                    <div className="ledger-label ledger-label--name">
                      <strong>{row.display_name ?? row.email}</strong>
                      <p>
                        {row.display_name ? `${row.email} · ` : ''}
                        {roleLabel(row.role)}
                        {row.deactivated_at
                          ? ` · deactivated ${formatDate(row.deactivated_at)}`
                          : ' · active'}
                        {isSelf ? ' · you' : ''}
                      </p>
                    </div>
                    <div className="ledger-controls">
                      {/* Changing your own role is refused by set_user_role()
                          whoever you are — the check is there so the last
                          administrator cannot demote themselves out of the
                          role by accident. The control is disabled to say so
                          before the round trip rather than after it. */}
                      <select
                        aria-label={`Role for ${row.email}`}
                        value={row.role}
                        disabled={isSelf || Boolean(busy)}
                        onChange={(e) =>
                          setPending({ kind: 'role', user: row, role: e.target.value })
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn--quiet btn--sm"
                        disabled={busy === `history-${row.id}`}
                        onClick={() => openHistory(row)}
                      >
                        {busy === `history-${row.id}` ? 'Opening…' : 'History'}
                      </button>
                      <button
                        type="button"
                        className={row.deactivated_at ? 'btn btn--quiet btn--sm' : 'btn btn--danger btn--sm'}
                        disabled={isSelf || Boolean(busy)}
                        onClick={() =>
                          setPending({ kind: 'active', user: row, active: Boolean(row.deactivated_at) })
                        }
                      >
                        <Icon name={row.deactivated_at ? 'check' : 'lock'} size={14} />
                        {row.deactivated_at ? 'Reactivate' : 'Deactivate'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <p className="panel-note">
            Page {page + 1} · showing {users.length} of at most {PAGE_SIZE}
          </p>
          <div className="ledger-controls">
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              disabled={page === 0 || loading}
              onClick={() => goToPage(Math.max(0, page - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              disabled={!hasNextPage || loading}
              onClick={() => goToPage(page + 1)}
            >
              Next
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </StaggerItem>

        {history && (
          <StaggerItem className="panel" index={2}>
            <div className="panel-head">
              <span className="panel-head-num">§ 03</span>
              <h2>Role history — {history.user.email}</h2>
            </div>
            {history.entries.length === 0 ? (
              <p className="empty-state">
                This account has never had its role changed. It holds the role it was created with.
              </p>
            ) : (
              <div className="ledger">
                {history.entries.map((entry) => (
                  <div className="ledger-row" key={entry.id}>
                    <div className="ledger-label">
                      <strong>
                        {entry.previous_role ? roleLabel(entry.previous_role) : 'Created'} →{' '}
                        {roleLabel(entry.new_role)}
                      </strong>
                      <p>{entry.reason ?? 'No reason recorded.'}</p>
                    </div>
                    <span className="mono">{formatDate(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setHistory(null)}>
              <Icon name="close" size={14} />
              Close history
            </button>
          </StaggerItem>
        )}
      </StaggerGroup>

      <ConfirmModal
        open={Boolean(pending)}
        slug={confirmCopy?.slug ?? 'Confirmation required'}
        title={confirmCopy?.title ?? ''}
        message={confirmCopy?.message ?? ''}
        confirmLabel={busy === 'confirm' ? 'Working…' : confirmCopy?.confirmLabel ?? 'Confirm'}
        confirmDisabled={busy === 'confirm'}
        onConfirm={runPending}
        onCancel={() => busy !== 'confirm' && setPending(null)}
      />
    </div>
  )
}
