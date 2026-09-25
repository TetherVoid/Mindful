import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadReportData } from '@backend/services/report/data'
import { buildInsights, hasEnoughToReport, buildReportPayload } from '@backend/services/report/insights'
import { requestReport, writeReportLocally } from '@backend/services/report/client'
import FormError from '@frontend/components/FormError'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'

function Figure({ value, unit, label }) {
  return (
    <div className="brief-figure">
      <span className="figure">
        <span className="figure-num">{value}</span>
        {unit && <span className="figure-unit">{unit}</span>}
      </span>
      <span className="brief-figure-label">{label}</span>
    </div>
  )
}

// The numbers the page can always show, with or without a written report.
// They are the report's evidence, printed next to it rather than behind it.
function Figures({ insights }) {
  const { mood, habits, thoughts } = insights
  const items = []

  if (mood.count) {
    items.push({ value: mood.mean, unit: '/ 5', label: `Mean mood over ${mood.count} entries` })
    items.push({ value: mood.streak, unit: mood.streak === 1 ? 'day' : 'days', label: 'Current logging streak' })
  }
  if (habits.active) {
    items.push({
      value: habits.overallRate != null ? `${Math.round(habits.overallRate * 100)}%` : '—',
      label: `Habits kept across ${habits.active} on the register`,
    })
  }
  if (thoughts.count) {
    items.push({
      value: thoughts.reframeRate != null ? `${Math.round(thoughts.reframeRate * 100)}%` : '—',
      label: `Records reaching a balanced thought, of ${thoughts.count}`,
    })
  }

  if (!items.length) return null

  return (
    <div className="brief-figures">
      {items.map((item) => (
        <Figure key={item.label} {...item} />
      ))}
    </div>
  )
}

function ReportBody({ report }) {
  // Every list is optional at the boundary even though the schema requires it:
  // a report that arrives over the network is not something the page controls.
  const sections = report.sections ?? []
  const noticed = report.noticed ?? []
  const questions = report.questions ?? []

  return (
    <>
      <Reveal as="section" className="panel brief" index={1}>
        <div className="panel-head">
          <span className="panel-head-num">§ 01</span>
          <h2>{report.title}</h2>
          <span className="panel-head-note">
            {report.source === 'local' ? 'Written in browser' : 'Written by Claude'}
          </span>
        </div>
        <p className="brief-summary">{report.summary}</p>
      </Reveal>

      <StaggerGroup base={0.06}>
        {sections.map((section, i) => (
          <StaggerItem key={`${i}-${section.heading}`} index={i}>
            <section className="panel">
              <div className="panel-head">
                <span className="panel-head-num">§ {String(i + 2).padStart(2, '0')}</span>
                <h2>{section.heading}</h2>
              </div>
              <p className="brief-body">{section.body}</p>
            </section>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {noticed.length > 0 && (
        <Reveal as="section" className="panel" index={2}>
          <div className="panel-head">
            <span className="panel-head-num">§ {String(sections.length + 2).padStart(2, '0')}</span>
            <h2>Marked in the margin</h2>
          </div>
          <ul className="brief-list">
            {noticed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Reveal>
      )}

      {questions.length > 0 && (
        <Reveal as="section" className="panel" index={2}>
          <div className="panel-head">
            <span className="panel-head-num">
              § {String(sections.length + 3).padStart(2, '0')}
            </span>
            <h2>Left open</h2>
            <span className="panel-head-note">For you, not for the page</span>
          </div>
          <ul className="brief-list brief-list--asked">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Reveal>
      )}
    </>
  )
}

export default function Report() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [rows, setRows] = useState({ moods: [], habits: [], habitLogs: [], thoughts: [] })

  const [report, setReport] = useState(null)
  const [notice, setNotice] = useState(null)
  const [writing, setWriting] = useState(false)
  const [writeError, setWriteError] = useState(null)
  const [showPayload, setShowPayload] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await loadReportData()
      if (error) {
        setLoadError(error.message)
        setLoading(false)
        return
      }
      setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  const insights = useMemo(() => buildInsights(rows), [rows])
  const enough = hasEnoughToReport(insights)

  // The disclosure and the request read the same builder, so what is shown
  // here is exactly what would be sent — it cannot drift out of date.
  const payloadPreview = useMemo(
    () => JSON.stringify(buildReportPayload(insights), null, 2),
    [insights]
  )

  async function handleWrite() {
    setWriting(true)
    setWriteError(null)
    setNotice(null)
    const result = await requestReport(insights)
    if (result.error) {
      setWriteError(result.error)
    } else {
      setReport(result.report)
      setNotice(result.notice)
    }
    setWriting(false)
  }

  function handleWriteLocally() {
    setWriteError(null)
    setNotice(null)
    setReport(writeReportLocally(insights))
  }

  const header = (
    <Reveal as="header" className="folio-head" y={14} index={0}>
      <div>
        <p className="folio-kicker">Section 05</p>
        <h1 className="folio-title">
          The <em>reading</em>
        </h1>
        <p className="folio-standfirst">
          Everything you have written down, read back to you as one piece. The figures are worked
          out in your browser; the words around them can be written here or by Claude.
        </p>
      </div>
      <div className="folio-meta">
        <span>
          <b>{new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</b>
        </span>
        <span>Folio 05</span>
      </div>
    </Reveal>
  )

  if (loading) {
    return (
      <div className="folio">
        {header}
        <div className="ruled-skeleton ruled-skeleton--list" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="folio">
        {header}
        <FormError message={loadError} />
      </div>
    )
  }

  if (!enough) {
    return (
      <div className="folio">
        {header}
        <section className="panel">
          <div className="panel-head">
            <span className="panel-head-num">§ 01</span>
            <h2>Not enough on the page yet</h2>
          </div>
          <p className="empty-state">
            A reading needs something to read. A few mood entries, or one worked-through thought
            record, and this page has something to say.
          </p>
          <div className="brief-actions">
            <Link to="/mood" className="btn btn--solid">
              <Icon name="plus" size={15} />
              Log a mood
            </Link>
            <Link to="/thoughts" className="btn btn--quiet">
              Write a thought record
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="folio">
      {header}

      <Reveal as="section" className="panel" index={1}>
        <div className="panel-head">
          <span className="panel-head-num">§ 00</span>
          <h2>The figures</h2>
          <span className="panel-head-note">Worked out on this device</span>
        </div>
        <Figures insights={insights} />
        {insights.gaps.length > 0 && (
          <ul className="brief-list brief-list--gaps">
            {insights.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
      </Reveal>

      {!report && (
        <Reveal as="section" className="panel" index={2}>
          <div className="panel-head">
            <span className="panel-head-num">§ 01</span>
            <h2>Write the reading</h2>
          </div>

          <div className="ledger">
            <div className="ledger-row ledger-row-stacked">
              <span className="ledger-label">
                <strong>What leaves this device</strong>
                <p>
                  Only the figures above — counts, averages, dates, habit names and emotion labels —
                  and only when you press the button. The wording of your thought records and notes
                  never leaves this device. The figures are sent to Anthropic&rsquo;s API to be
                  written up, and are not stored by this app.
                </p>
              </span>
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                onClick={() => setShowPayload((v) => !v)}
                aria-expanded={showPayload}
              >
                {showPayload ? 'Hide it' : 'Show me exactly'}
              </button>
              {showPayload && <pre className="brief-payload">{payloadPreview}</pre>}
            </div>
          </div>

          {writeError && <FormError message={writeError} />}

          <div className="brief-actions">
            <button type="button" className="btn btn--solid" onClick={handleWrite} disabled={writing}>
              {writing ? 'Writing…' : 'Write the reading'}
            </button>
            <button type="button" className="btn btn--quiet" onClick={handleWriteLocally} disabled={writing}>
              Write it here instead
            </button>
          </div>
          <p className="panel-note">
            &ldquo;Write it here instead&rdquo; composes the same report from the same figures
            without a network request. Nothing leaves your browser.
          </p>
        </Reveal>
      )}

      {notice && <p className="brief-notice">{notice}</p>}

      {report && <ReportBody report={report} />}

      {report && (
        <div className="brief-actions brief-actions--foot">
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() => {
              setReport(null)
              setNotice(null)
            }}
          >
            Write another
          </button>
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => window.print()}>
            <Icon name="download" size={15} />
            Print this reading
          </button>
        </div>
      )}

      <p className="brief-footnote">
        A reading is a description of what you wrote down, not an assessment of you. It is not
        medical advice and cannot see anything you have not recorded. If something here worries you,
        a doctor or a local crisis line is the right place to take it.
      </p>
    </div>
  )
}
