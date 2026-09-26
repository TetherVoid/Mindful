// Fetches the written report, and decides when not to.
//
// Two ways to get a report, and the page treats them as equals rather than as
// a good one and a broken one: Claude writes it from the figures, or the
// browser writes it from the same figures. The second never leaves the device,
// always works, and is what you get if anything at all goes wrong with the
// first.

import { supabase } from '@backend/database/client'
import { anonymiseForReport } from './insights'
import { writeLocalReport } from './narrative'
import { restoreNames } from './names'

const ENDPOINT = '/api/report'
const TIMEOUT_MS = 60000

// What a reader sees when the reading had to be written in the browser. The
// server's own error text is for the logs, not the page — "No report service
// configured" is a deployment detail, not something a student did.
const FALLBACK_NOTICE =
  "The writing service isn't available just now, so this reading was written in your browser instead."


export function writeReportLocally(insights) {
  return { ...writeLocalReport(insights), source: 'local' }
}

async function accessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

/**
 * Asks the API for a written report, falling back to the local one.
 *
 * Resolves to `{ report, notice }`. `notice` is set only when the fallback was
 * used, and carries the reason in the reader's language — the page says why it
 * is showing a locally written report rather than quietly showing a worse one.
 *
 * `subjectUserId` names whose record the figures describe. Leave it unset for
 * the ordinary case, a reader looking at their own. Setting it to somebody else
 * is a claim, and the endpoint settles that claim against the database before
 * writing a word — so passing a student's id is not a way to obtain a report
 * about a student you do not teach.
 */
export async function requestReport(insights, { subjectUserId = null } = {}) {
  // Fixtures mode has no real session to authenticate with, so there is nothing
  // to try. Say so rather than firing a request that is certain to 401.
  if (supabase.__isFixtureClient) {
    return {
      report: writeReportLocally(insights),
      notice: 'Running on local sample data, so this report was written in your browser.',
    }
  }

  const token = await accessToken()
  if (!token) {
    return {
      report: writeReportLocally(insights),
      notice: 'Your session could not be confirmed, so this report was written in your browser.',
    }
  }

  const { figures, labels } = anonymiseForReport(insights)
  const payload = { figures }
  if (subjectUserId) payload.subjectUserId = subjectUserId
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      // 429 is the one failure worth stopping on: falling back silently would
      // hide that the reader asked for the same thing several times over.
      if (response.status === 429) {
        return { report: null, error: body.error ?? 'Too many reports for now. Try again later.' }
      }
      // 403 is the other one worth stopping on. Falling back would write the
      // report in the browser from figures the server has just said this reader
      // is not entitled to — a refusal that produces the thing it refused.
      if (response.status === 403) {
        return { report: null, error: body.error ?? 'You do not have access to that record.' }
      }
      return { report: writeReportLocally(insights), notice: FALLBACK_NOTICE }
    }

    return { report: restoreNames(await response.json(), labels), notice: null }
  } catch {
    return { report: writeReportLocally(insights), notice: FALLBACK_NOTICE }
  } finally {
    clearTimeout(timer)
  }
}
