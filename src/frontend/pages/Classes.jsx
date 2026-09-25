import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createClass, joinClass, listClassRoster, listMyClasses, loadClassOverview, loadStudentOverview, leaveClass, rotateJoinCode } from '@backend/services/classes'
import { useAuth } from '@backend/auth/AuthContext'
import ConfirmModal from '@frontend/components/ConfirmModal'
import FormError from '@frontend/components/FormError'
import FormSuccess from '@frontend/components/FormSuccess'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'

export default function Classes() {
  const { isTeacher, isAdmin } = useAuth()

  const [classes, setClasses] = useState([])
  const [selected, setSelected] = useState(null)
  const [roster, setRoster] = useState([])
  const [overview, setOverview] = useState([])
  const [studentDetail, setStudentDetail] = useState(null)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [leaving, setLeaving] = useState(null)

  async function load() {
    const { data, error: err } = await listMyClasses()
    if (err) setError(err.message)
    else setClasses(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    void listMyClasses().then(({ data, error: err }) => {
      if (!active) return
      if (err) setError(err.message)
      else setClasses(data ?? [])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  // Two calls, because they answer two different questions. class_roster() is
  // the whole membership; class_overview() omits anyone who has not opted in.
  // Without the first, an empty second one is ambiguous — nobody has joined and
  // nobody has shared look identical, and they call for opposite advice.
  async function openClass(room) {
    setSelected(room)
    setRoster([])
    setOverview([])
    setStudentDetail(null)
    setError(null)
    if (!isTeacher) return
    setBusy('overview')
    const [rosterResult, overviewResult] = await Promise.all([listClassRoster(room.id), loadClassOverview(room.id)])
    setBusy(null)
    const err = rosterResult.error ?? overviewResult.error
    if (err) return setError(err.message)
    setRoster(rosterResult.data ?? [])
    setOverview(overviewResult.data ?? [])
  }

  async function inspectStudent(student) {
    setBusy(`student-${student.user_id}`)
    setError(null)
    const { data, error: err } = await loadStudentOverview(student.user_id)
    setBusy(null)
    if (err) setError(err.message)
    else setStudentDetail(Array.isArray(data) ? data[0] : data)
  }

  async function makeClass(e) {
    e.preventDefault()
    setBusy('create')
    const { error: err } = await createClass(name)
    setBusy(null)
    if (err) return setError(err.message)
    setName('')
    setSuccess('Class created.')
    load()
  }

  async function join(e) {
    e.preventDefault()
    setBusy('join')
    const { error: err } = await joinClass(code)
    setBusy(null)
    if (err) return setError(err.message)
    setCode('')
    setSuccess('You joined the class.')
    load()
  }

  async function rotate() {
    setBusy('rotate')
    const { data, error: err } = await rotateJoinCode(selected.id)
    setBusy(null)
    if (err) return setError(err.message)
    setSelected((room) => ({ ...room, join_code: data?.join_code ?? room.join_code }))
    setClasses((all) => all.map((room) => room.id === selected.id ? { ...room, join_code: data?.join_code ?? room.join_code } : room))
    setSuccess('A new join code has been issued.')
  }

  async function confirmLeave() {
    setBusy('leave')
    const { error: err } = await leaveClass(leaving.id)
    setBusy(null)
    setLeaving(null)
    if (err) return setError(err.message)
    setSelected(null)
    setSuccess('You left the class.')
    load()
  }

  // class_overview() returns a row per student whose figures the caller may
  // read — for teachers and administrators alike, the students who opted in,
  // and nobody at all if the class is archived. "Who is sharing" is counted
  // from the roster's own flag rather than from the number of rows that came
  // back, so an archived class still reports its members' choices honestly.
  const figuresByStudent = new Map(overview.map((row) => [row.user_id, row]))
  const sharingCount = roster.filter((student) => student.share_with_teachers).length
  const title = isAdmin ? 'Class administration' : isTeacher ? 'Your classes' : 'Your classes'

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Section 07</p>
          <h1 className="folio-title">Class <em>register</em></h1>
          <p className="folio-standfirst">
            {isTeacher
              ? 'Class summaries show only the figures students have chosen to share.'
              : 'Join a class with the code your teacher gave you. Your written entries remain private.'}
          </p>
        </div>
        <div className="folio-meta">
          <span>{isAdmin ? 'Administrator' : isTeacher ? 'Teacher view' : 'Student view'}</span>
        </div>
      </Reveal>

      <FormError message={error} label="Classes" />
      <FormSuccess visible={Boolean(success)} message={success} />

      <StaggerGroup base={0.05}>
        <StaggerItem className="panel" index={0}>
          <div className="panel-head">
            <span className="panel-head-num">§ 01</span>
            <h2>{title}</h2>
          </div>
          {loading ? (
            <div className="ruled-skeleton ruled-skeleton--table" />
          ) : classes.length === 0 ? (
            <p className="empty-state">
              No classes yet. {isTeacher ? 'Create one below to issue a join code.' : 'Ask your teacher for a join code.'}
            </p>
          ) : (
            <div className="ledger">
              {classes.map((room) => (
                <div className="ledger-row" key={room.id}>
                  <div className="ledger-label ledger-label--name">
                    <strong>{room.name}</strong>
                    <p>
                      {room.archived
                        ? 'Archived'
                        : selected?.id === room.id && isTeacher
                          ? `${roster.length} enrolled · ${sharingCount} sharing figures`
                          : 'Open the register to view details.'}
                    </p>
                  </div>
                  <button type="button" className="btn btn--quiet btn--sm" onClick={() => openClass(room)}>
                    {selected?.id === room.id ? 'Open' : 'View'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </StaggerItem>

        {selected && (
          <StaggerItem className="panel" index={1}>
            <div className="panel-head">
              <span className="panel-head-num">§ 02</span>
              <h2>{selected.name}</h2>
            </div>
            {isTeacher ? (
              <>
                <div className="ledger">
                  <div className="ledger-row">
                    <div className="ledger-label">
                      <strong>Join code</strong>
                      <p className="join-code">{selected.join_code}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--quiet btn--sm"
                      disabled={busy === 'rotate'}
                      onClick={rotate}
                    >
                      {busy === 'rotate' ? 'Rotating…' : 'Rotate code'}
                    </button>
                  </div>
                </div>
                {busy === 'overview' ? (
                  <div className="ruled-skeleton ruled-skeleton--table" />
                ) : roster.length === 0 ? (
                  <p className="empty-state">
                    Nobody has joined this class yet. Give students the join code above.
                  </p>
                ) : (
                  <>
                    <p className="panel-note">
                      {roster.length} enrolled · {sharingCount} sharing figures
                    </p>
                    {sharingCount === 0 && (
                      <p className="empty-state">
                        Everyone here has kept their figures private. That is their choice to make in
                        Settings, not a gap in the record.
                      </p>
                    )}
                    <div className="ledger">
                      {roster.map((student) => {
                        const figures = figuresByStudent.get(student.user_id)
                        return (
                          <div className="ledger-row ledger-row--roster" key={student.user_id}>
                            <div className="ledger-label ledger-label--name">
                              <strong>{student.display_name ?? 'Student'}</strong>
                              <p>
                                {figures ? (
                                  <>
                                    {figures.mood_entries} mood entries · {figures.active_habits} active habits · {figures.thought_record_count} thought records
                                  </>
                                ) : (
                                  'Not sharing figures'
                                )}
                              </p>
                            </div>
                            {figures ? (
                              <button
                                type="button"
                                className="btn btn--quiet btn--sm"
                                disabled={busy === `student-${student.user_id}`}
                                onClick={() => inspectStudent(student)}
                              >
                                {busy === `student-${student.user_id}` ? 'Opening…' : 'View summary'}
                              </button>
                            ) : (
                              <span className="mono">Private</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {studentDetail && (
                  <div className="ledger">
                    <div className="ledger-row ledger-row--roster">
                      <div className="ledger-label ledger-label--name">
                        <strong>{studentDetail.display_name ?? 'Student'}’s authorised summary</strong>
                        <p>
                          {studentDetail.mood_entries} mood entries · {studentDetail.habit_ticks} habit ticks · last active {studentDetail.last_activity_at ? new Date(studentDetail.last_activity_at).toLocaleDateString() : 'not recorded'}
                        </p>
                      </div>
                      <span className="mono">
                        {studentDetail.average_mood == null ? '—' : `${Number(studentDetail.average_mood).toFixed(1)} / 5`}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="ledger">
                <div className="ledger-row">
                  <div className="ledger-label">
                    <strong>Membership</strong>
                    <p>You can leave this class at any time. Your own data remains in your account.</p>
                  </div>
                  <button type="button" className="btn btn--danger btn--sm" onClick={() => setLeaving(selected)}>
                    Leave class
                  </button>
                </div>
              </div>
            )}
          </StaggerItem>
        )}

        {isTeacher ? (
          <StaggerItem className="panel" index={2}>
            <div className="panel-head">
              <span className="panel-head-num">§ 03</span>
              <h2>Create a class</h2>
            </div>
            <form className="settings-form" onSubmit={makeClass}>
              <div className="field">
                <label htmlFor="class-name">Class name</label>
                <input id="class-name" value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
              </div>
              <button type="submit" className="btn btn--solid" disabled={busy === 'create'}>
                <Icon name="plus" size={15} />
                {busy === 'create' ? 'Creating…' : 'Create class'}
              </button>
            </form>
          </StaggerItem>
        ) : (
          <StaggerItem className="panel" index={2}>
            <div className="panel-head">
              <span className="panel-head-num">§ 03</span>
              <h2>Join a class</h2>
            </div>
            <form className="settings-form" onSubmit={join}>
              <div className="field">
                <label htmlFor="join-code">Join code</label>
                <input
                  id="join-code"
                  value={code}
                  required
                  maxLength={32}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                />
              </div>
              <button type="submit" className="btn btn--solid" disabled={busy === 'join'}>
                {busy === 'join' ? 'Joining…' : 'Join class'}
              </button>
            </form>
          </StaggerItem>
        )}
      </StaggerGroup>

      <p className="panel-note">
        Need help with your account or class access? <Link to="/settings">Review your privacy settings.</Link>
      </p>

      <ConfirmModal
        open={Boolean(leaving)}
        title="Leave this class?"
        message="You will lose access to this class until you join again with a valid code."
        confirmLabel={busy === 'leave' ? 'Leaving…' : 'Leave class'}
        confirmDisabled={Boolean(busy)}
        onConfirm={confirmLeave}
        onCancel={() => !busy && setLeaving(null)}
      />
    </div>
  )
}
