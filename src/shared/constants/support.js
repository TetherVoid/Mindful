// Where to find help, shown on every page of the app.
//
// This is signposting, not crisis handling. It is always visible, to everyone,
// and nothing in the app decides who "needs" it: there is deliberately no code
// path that reads a mood score or a note and shows this in response. Detection
// would be surveillance, would teach students to under-report, and would be a
// clinical judgement this app is in no position to make.
//
// Government services only. Each number below was checked against an official
// source on the date given. They change rarely but they do change — KIRAN
// (1800-599-0019) was merged into Tele-MANAS and phased out in 2024 (PIB release
// 2006265, 15 Feb 2024: "calls from KIRAN will be diverted to TeleMANAS and
// eventually, the first helpline will be phased out"), which is why it is not
// listed. Re-check every number at least once a year; SESSION_NOTES.md carries
// the reminder.
//
// Shared rather than frontend-owned so that design primitives (the colophon,
// the frontispiece) can render it without importing from frontend/.

export const SUPPORT_LAST_VERIFIED = '2026-09-25'

export const SUPPORT_LINES = [
  {
    id: 'telemanas',
    name: 'Tele-MANAS',
    number: '14416',
    dial: '14416',
    // Also reachable as 1-800-891-4416. Both numbers:
    //   https://telemanas.mohfw.gov.in/home  (Ministry of Health & Family Welfare)
    // Free, 24/7, caller chooses the language:
    //   https://pib.gov.in/PressReleseDetailm.aspx?PRID=1866498  (PIB, 10 Oct 2022)
    alternate: { number: '1-800-891-4416', dial: '18008914416' },
    note: 'free, any time, in your language',
  },
  {
    id: 'childline',
    name: 'Child Helpline',
    number: '1098',
    dial: '1098',
    // 24x7 control room in every state, integrated with ERSS-112:
    //   https://wcd.gov.in/child/child-helpline  (Ministry of Women & Child Development)
    note: 'for anyone under 18',
  },
  {
    id: 'emergency',
    name: 'Emergency',
    number: '112',
    dial: '112',
    // Single emergency number, live in all states and UTs:
    //   https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss
    //   (Ministry of Home Affairs, ERSS)
    note: 'if you are in danger now',
  },
]
