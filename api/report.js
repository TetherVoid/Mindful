// POST /api/report — turns a set of derived figures into a written report.
//
// The browser does the arithmetic (backend/services/report/insights.js) and
// sends the result; this function only writes prose around numbers it is given.
// It never reads journal data from the database, so the worst a forged request
// can do is spend tokens — which is exactly what the auth check and the two
// limits below are for.
//
// Cost controls, in the order a request meets them:
//   1. an in-memory limiter — a speed bump against a loop in one instance;
//   2. claim_report_slot() in the database — the real ceiling: 3 readings per
//      student and 300 per deployment in any 24 hours, shared by every
//      instance, and failing CLOSED (no slot, no model call) if the database
//      cannot be asked;
//   3. the model call itself: Claude Sonnet 5 at low effort with max_tokens
//      4000 — roughly $0.025 for a typical reading and about $0.06 at most.
//      Token counts (never content) are logged so those estimates can be
//      replaced with real numbers.
//
// One thing it does check against the database: if the caller says the figures
// belong to somebody else (a teacher asking for a report about a student), the
// claim is put to may_view_student() using the CALLER'S OWN token, so the
// answer comes from the same authorisation rules the browser is subject to.
// Without that check a teacher could paste any student id into the request and
// have a report written under that name.
//
// Environment:
//   ANTHROPIC_API_KEY   required. Server-side only — a VITE_ prefix would inline
//                       it into the public bundle. Without it the endpoint
//                       returns 503 and the client falls back to the locally
//                       written report.
//   SUPABASE_URL        \ used to verify the caller's access token. Falls back
//   SUPABASE_ANON_KEY   / to the VITE_-prefixed pair, which the build already
//                         needs, so a Vercel project usually has these already.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { verifyCaller, callRpcAsUser, createRateLimiter, sendJson } from './_lib/auth.js'
import { findDisallowedText } from './_lib/figures.js'

export const config = { maxDuration: 60 }

// Sonnet 5 rather than Opus: the page is a few hundred words of careful prose
// around figures it is handed, and the judgement it needs — hedging by sample
// size, never implying cause, the self-harm instruction — holds at this tier.
const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 4000
const EFFORT = 'low'

// The in-memory speed bump. See createRateLimiter for what it is and is not
// worth; the database limit (claim_report_slot) is the one that counts.
const RATE_LIMIT = { max: 6, windowMs: 60 * 60 * 1000 }
const overRateLimit = createRateLimiter(RATE_LIMIT)

// What claim_report_slot() can say no with, in the reader's words. Both point
// at the browser-written reading, which has no limit because it costs nothing.
const LIMIT_MESSAGES = {
  user_limit:
    'That is three readings today, which is as many as there can be in a day. “Write it here instead” still works, any time.',
  global_limit:
    'The writing service has reached its limit for today. “Write it here instead” still works, any time.',
  // Since 20260927000200: a slot needs a confirmed account at least a day old,
  // so a burst of new sign-ups cannot spend the deployment's allowance.
  account_too_new:
    'The written reading opens on your account’s second day. “Write it here instead” works now.',
  unconfirmed:
    'Confirm your email address first — the link is in your inbox. “Write it here instead” works now.',
}

const MAX_BODY_BYTES = 64 * 1024

const ReportSchema = z.object({
  title: z.string().describe('Four to six words. A description of the stretch, not a verdict on the person.'),
  summary: z
    .string()
    .describe('Two or three sentences naming what is actually in the data and what stands out.'),
  sections: z
    .array(
      z.object({
        heading: z.string().describe('Two to four words.'),
        body: z
          .string()
          .describe(
            'Two to five sentences. Every claim must cite a figure from the input. No advice.'
          ),
      })
    )
    .describe('Three or four sections, each covering a different part of the record.'),
  noticed: z
    .array(z.string())
    .describe('Three to five single-sentence observations, each anchored to a specific number.'),
  questions: z
    .array(z.string())
    .describe('Two or three open questions the figures raise that only the writer can answer.'),
})

// The helpline number in the self-harm instruction below is a literal copy of
// src/shared/constants/support.js. If that file changes, change this too.
const SYSTEM_PROMPT = `You write the reflective summary page of Mindful, a private journal in which one person records their mood, the habits they are keeping, and CBT thought records.

Your job is to read a set of figures already computed from that person's own entries and write them back as something readable — so they can see the shape of their own record without doing the arithmetic.

How to write:
- Address the reader as "you". Plain, warm, unhurried. The app's voice is a well-set almanac: exact, quiet, never chirpy.
- Every claim must trace to a figure you were given. Quote the number. If a figure is null or absent, that part of their record is thin — say so plainly rather than filling the gap.
- Where two things line up in time, say they line up. Do not say one caused the other. Same-day association in a few dozen entries is not evidence of a cause, and the reader deserves to be told which one they are looking at.
- Small samples get hedged language. The figures include counts; use them to decide how firmly to speak.
- No advice, no plans, no prescriptions, no encouragement to do more of anything. The reader decides what to do; you describe what is written down.
- Never diagnose, never name a condition, never assess risk, never suggest the reader is unwell or well. You are describing a notebook, not a person.
- If anything you are given suggests the reader may be at risk of self-harm or in danger, do not analyse it and do not counsel. Say in one plain sentence that this is beyond what a summary page should speak to, and that talking to a doctor, or calling Tele-MANAS on 14416 (India's free national mental health helpline, open any time), is the right next step. Then continue with the rest of the report normally.

You see figures only — never anything the reader typed. Habits and emotions appear as numbered labels such as "Habit 2" and "Emotion 1"; the reader's own names for them stay on their device, and their page puts those names back after you have written. Refer to habits and emotions by exactly those labels, and never guess what they stand for.`

// Everything below is caller-supplied. The figures are computed in the browser,
// so they are already untrusted input — the model is told to describe them, and
// nothing acts on them, but they still get bounded before they reach a prompt.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Whether the caller may have a report written about `subjectUserId`.
 *
 * Absent or equal to the caller: yes, trivially. Anything else is a claim about
 * someone else's record, and the claim is settled by may_view_student() run
 * under the caller's own token — the same function, the same rules, the same
 * answer the browser would get.
 */
async function authoriseSubject(auth, subjectUserId) {
  if (subjectUserId == null || subjectUserId === auth.userId) {
    return { ok: true, subjectUserId: auth.userId }
  }
  if (typeof subjectUserId !== 'string' || !UUID.test(subjectUserId)) {
    return { ok: false, status: 400, message: 'That is not a user id.' }
  }

  const { data, error } = await callRpcAsUser(auth.token, 'may_view_student', {
    p_student_id: subjectUserId,
  })
  if (error) return { ok: false, status: 502, message: 'Could not check who that record belongs to.' }
  if (data !== true) {
    // Same answer whether the student does not exist or the caller simply may
    // not see them, so this cannot be used to test which ids are real.
    return { ok: false, status: 403, message: 'You do not have access to that record.' }
  }
  return { ok: true, subjectUserId }
}

// Figures only. The wording of thought records and mood notes is never part of
// this prompt: the opt-in that once sent it was removed for every user on
// 2026-09-25, and the handler does not read an `excerpts` field even if a
// request carries one.
function buildUserMessage({ figures }) {
  return [
    'Here is the record, already summarised into figures. Write the report page from it.',
    '',
    'Figures:',
    '```json',
    JSON.stringify(figures, null, 1),
    '```',
    '',
    'The wording of the reader\'s thought records and notes stays on their device and is not available to you. Work from the figures alone and do not ask for the text.',
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: 'Use POST.' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 503, { error: 'No report service configured.', fallback: true })
  }

  const auth = await verifyCaller(req)
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.message })

  if (overRateLimit(auth.userId)) {
    return sendJson(res, 429, {
      error: `That is ${RATE_LIMIT.max} reports this hour. Try again later.`,
    })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}

  // Size first, and before anything is copied or reformatted: it is the only
  // check that bounds how much work every check after it has to do.
  let bodyBytes
  try {
    bodyBytes = Buffer.byteLength(JSON.stringify(body))
  } catch {
    return sendJson(res, 400, { error: 'That request could not be read.' })
  }
  if (bodyBytes > MAX_BODY_BYTES) {
    return sendJson(res, 413, { error: 'That is more history than one report can hold.' })
  }

  if (!body.figures || typeof body.figures !== 'object' || Array.isArray(body.figures)) {
    return sendJson(res, 400, { error: 'No figures supplied.' })
  }

  // Nothing a student typed may reach a prompt. The browser strips it; this
  // refuses anything that got through regardless. Only the path is logged —
  // the value may be exactly the text that must not be written anywhere.
  const disallowed = findDisallowedText(body.figures)
  if (disallowed) {
    console.error(`[report] refused: unrecognised text at ${disallowed}`)
    return sendJson(res, 400, { error: 'That request carried text the reading does not accept.', fallback: true })
  }

  const subject = await authoriseSubject(auth, body.subjectUserId)
  if (!subject.ok) return sendJson(res, subject.status, { error: subject.message })

  // The spending ceiling. Asked last, after every check that could refuse the
  // request for free, so a refused request never uses up a slot. Asked with
  // the caller's own token, so the slot is charged to the caller and nobody
  // else. A slot is spent even if the model call below then fails — that is
  // what stops a failing request from being retried into a bill.
  const slot = await callRpcAsUser(auth.token, 'claim_report_slot')
  if (slot.error) {
    // Fail closed: if the limit cannot be checked, no model is called. The
    // reader gets the browser-written reading instead.
    console.error('[report] could not claim a slot; not calling the model')
    return sendJson(res, 503, { error: 'The writing service is unavailable.', fallback: true })
  }
  if (slot.data !== 'ok') {
    return sendJson(res, 429, { error: LIMIT_MESSAGES[slot.data] ?? LIMIT_MESSAGES.global_limit })
  }

  // body.excerpts is deliberately not read. See buildUserMessage.
  const prompt = buildUserMessage({ figures: body.figures })

  const client = new Anthropic()

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: zodOutputFormat(ReportSchema), effort: EFFORT },
    })

    // Counts only — never content, never who asked.
    console.info(
      `[report] model=${MODEL} stop=${response.stop_reason} input_tokens=${response.usage?.input_tokens} output_tokens=${response.usage?.output_tokens}`
    )

    // A safety decline returns HTTP 200 with no usable content, and a reading
    // cut off at MAX_TOKENS will not parse; both fall back to the browser.
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return sendJson(res, 422, {
        error: 'The report could not be written for this entry.',
        fallback: true,
      })
    }

    return sendJson(res, 200, { ...response.parsed_output, source: 'claude', model: MODEL })
  } catch (error) {
    // Every branch logs the detail and returns a sentence. An upstream error
    // message can name a model, a quota, an account — none of which is the
    // caller's business, and some of which is a hint about the deployment.
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('[report] Anthropic key rejected')
      return sendJson(res, 503, { error: 'Report service is misconfigured.', fallback: true })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return sendJson(res, 429, { error: 'The report service is busy. Try again shortly.' })
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[report] Anthropic error ${error.status}: ${error.message}`)
      return sendJson(res, 502, { error: 'The report could not be written just now.', fallback: true })
    }
    console.error('[report] Unexpected failure:', error)
    return sendJson(res, 500, { error: 'Something went wrong writing the report.', fallback: true })
  }
}
