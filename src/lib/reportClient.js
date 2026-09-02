// Fetches the written report, and decides when not to.
//
// Two ways to get a report, and the page treats them as equals rather than as
// a good one and a broken one: Claude writes it from the figures, or the
// browser writes it from the same figures. The second never leaves the device,
// always works, and is what you get if anything at all goes wrong with the
// first.

import { supabase } from './supabaseClient'
import { buildReportPayload } from './insights'
import { writeLocalReport } from './narrative'

const ENDPOINT = '/api/report'
const TIMEOUT_MS = 60000

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
 */
export async function requestReport(insights, thoughts, { includeText = false } = {}) {
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

  const payload = buildReportPayload(insights, thoughts, { includeText })
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
      return {
        report: writeReportLocally(insights),
        notice: `${body.error ?? 'The writing service was unreachable.'} This one was written in your browser instead.`,
      }
    }

    return { report: await response.json(), notice: null }
  } catch (error) {
    const reason =
      error.name === 'AbortError'
        ? 'The writing service took too long.'
        : 'The writing service could not be reached.'
    return {
      report: writeReportLocally(insights),
      notice: `${reason} This report was written in your browser instead.`,
    }
  } finally {
    clearTimeout(timer)
  }
}
