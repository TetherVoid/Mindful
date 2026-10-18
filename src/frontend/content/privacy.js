// "What Mindful stores and who can see it."
//
// Every statement here is a promise about the database or the server, and each
// one lists the files it was checked against in `sources`. If the access model
// changes, change this file in the same commit (AGENT_RULES.md § 3), and keep it
// in step with supabase/SECURITY.md and the privacy answers in faq.js.
//
// No imports: tests/privacy-copy.test.mjs reads this file directly.

// [DEDICATED EMAIL — the project owner fills this in.] While it is empty the
// page leaves the "Questions and requests" section out rather than print a
// placeholder; tests/privacy-copy.test.mjs accepts only '' or a real address.
export const DATA_REQUEST_CONTACT = ''

// Four lines at the top of the page. Each one summarises the sections below and
// must stay true to them; it is checked the same way.
export const shortVersion = [
  {
    text: 'Your journal is stored in Mindful’s database in Mumbai, and inside the app only you can read it.',
    sources: ['supabase/SECURITY.md:9', 'supabase/migrations/20260911000500_owner_policy_hardening.sql:65'],
  },
  {
    text: 'Teachers and administrators never see your mood notes, habit names or thought records. If you switch on sharing, they see figures, such as how many moods you logged and their scores.',
    sources: ['supabase/SECURITY.md:51', 'supabase/migrations/20260925000100_consent_scoped_reads.sql:42'],
  },
  {
    text: 'Even if you don’t share, your teachers and administrators see your display name, when you joined a class and whether you share, and administrators see your email address.',
    sources: ['supabase/migrations/20260911000400_teacher_reads.sql:18', 'supabase/migrations/20260911000800_admin_user_directory.sql:24'],
  },
  {
    text: 'The AI reading gets figures, never your words. From Preferences you can download your journal or delete your account; “Keeping, copying and deleting” says what is kept.',
    sources: ['api/_lib/figures.js:46', 'src/backend/services/account.js:29', 'api/account.js:70', 'supabase/migrations/20260911000200_roles.sql:56'],
  },
]

export const privacySections = [
  {
    heading: 'What Mindful stores',
    items: [
      {
        text: 'Your account: your email address and your sign-in details, held by Supabase, the database service Mindful runs on. Supabase also keeps records of sign-ins, which include the time and your IP address. If your school has switched on signing in with another account (such as Google), that provider confirms who you are, and the name it gives Mindful becomes your display name.',
        sources: ['supabase/migrations/20260911000100_baseline_production.sql:91', 'supabase/migrations/20260911000200_roles.sql:387', 'src/config/env.js:38'],
      },
      {
        text: 'Your profile: your display name, your role (student, teacher or administrator), whether you share figures with teachers, the date you signed up, and whether the account has been switched off.',
        sources: ['supabase/migrations/20260911000100_baseline_production.sql:91', 'supabase/migrations/20260911000200_roles.sql:32'],
      },
      {
        text: 'Campaign tags: if the link you first arrived by carried tags saying where it came from (the “utm_” part of a web address), your browser keeps them unless you had already declined local storage, and they are saved with your profile if you sign up with an email address and password. Declining later clears them from your browser but not from a profile they were already saved to.',
        sources: ['src/backend/utils/utm.js:9', 'src/backend/utils/consent.js:19', 'src/backend/auth/AuthContext.jsx:22', 'supabase/migrations/20260911000200_roles.sql:380'],
      },
      {
        text: 'Your journal: each mood score with its date and time and any note you add; your habits, their names and the days you ticked them; and everything you write in a thought record. It is stored in Mindful’s database, not only on your device, so it is there when you sign in somewhere else.',
        sources: ['supabase/migrations/20260911000100_baseline_production.sql:101', 'supabase/migrations/20260911000100_baseline_production.sql:126'],
      },
      {
        text: 'Your classes: which classes you are in, and when you joined. You join with a code; an administrator can also add you to a class or remove you from one, and a class’s teachers can remove you.',
        sources: ['supabase/migrations/20260911000300_classes.sql:34', 'supabase/migrations/20260911000300_classes.sql:251'],
      },
      {
        text: 'AI readings: each time you ask for one, the time is recorded against your account so the daily limit can be kept. These records are removed after 48 hours. The reading itself is not stored by Mindful’s server.',
        sources: ['supabase/migrations/20260926000100_report_limits_and_date_only_activity.sql:155', 'supabase/migrations/20260927000200_report_slot_eligibility.sql:59', 'api/report.js:235'],
      },
      {
        text: 'Where: the database is in Mumbai, India (Supabase, region ap-south-1), and Mindful’s server functions run in Mumbai too. The services named under “Other services” and “The AI reading” below are run by other companies and may handle requests outside India.',
        sources: ['supabase/SECURITY.md:9', 'vercel.json:2'],
      },
    ],
  },
  {
    heading: 'Who can read what you write',
    items: [
      {
        text: 'Inside the app, only you. Teachers and administrators have no access to your mood notes, your habit names or your thought records — there is no screen and no database rule that gives it to them.',
        sources: ['supabase/SECURITY.md:51', 'supabase/migrations/20260911000500_owner_policy_hardening.sql:65'],
      },
      {
        text: 'Whoever runs Mindful’s database has technical access to all of it, as with any online service. The app gives them no screen for reading your journal, but the database itself is not locked against its operator.',
        sources: ['supabase/SECURITY.md:7'],
      },
    ],
  },
  {
    heading: 'What your teachers can see',
    items: [
      {
        text: 'Whether or not you share: the teachers of a class you are in see your display name, whether you have switched sharing on, and the date you joined.',
        sources: ['supabase/migrations/20260911000400_teacher_reads.sql:18'],
      },
      {
        text: 'Only if you switch on “Share figures with teachers”, and only for a class of theirs that you are in and that has not been archived: how many moods you logged, the score of each one and the day it was on (not the time), your average, how many habits you have and how often you ticked each one and the day you last did (numbered, not named), how many thought records you wrote, and the day you last logged a mood and last wrote anything.',
        sources: ['supabase/migrations/20260925000100_consent_scoped_reads.sql:42', 'supabase/migrations/20260926000100_report_limits_and_date_only_activity.sql:88', 'supabase/migrations/20260925000100_consent_scoped_reads.sql:144', 'supabase/migrations/20260925000100_consent_scoped_reads.sql:174'],
      },
      {
        text: 'Other students in your classes see nothing about you. Sharing is off until you switch it on. Switching it off, leaving the class, or the class being archived ends a teacher’s view of your figures straight away. Teachers never see your email address.',
        sources: ['supabase/migrations/20260911000200_roles.sql:41', 'supabase/migrations/20260925000100_consent_scoped_reads.sql:42', 'supabase/migrations/20260911000800_admin_user_directory.sql:24'],
      },
    ],
  },
  {
    heading: 'What administrators can see and do',
    items: [
      {
        text: 'Administrators are the people your school (or whoever runs this copy of Mindful) has given that role. They can see every account’s email address, display name, role, sign-up date and whether it is switched off, and they can read the whole profile record, including your sharing setting and any campaign tags.',
        sources: ['supabase/migrations/20260911000800_admin_user_directory.sql:24', 'supabase/migrations/20260911000200_roles.sql:448'],
      },
      {
        text: 'They can see every class and who is in it, with each student’s display name, sharing setting and join date.',
        sources: ['supabase/migrations/20260911000400_teacher_reads.sql:18', 'supabase/SECURITY.md:84'],
      },
      {
        text: 'Your figures reach an administrator on the same terms as a teacher — only if you share — but for a student in any live class, not only classes of their own. Like teachers, they never see your words.',
        sources: ['supabase/migrations/20260925000100_consent_scoped_reads.sql:42', 'supabase/SECURITY.md:84'],
      },
      {
        text: 'They can change people’s roles, and every role change made in Mindful is recorded. They can switch an account off and back on. They cannot delete your account; only you can.',
        sources: ['supabase/migrations/20260911000200_roles.sql:298', 'supabase/migrations/20260911000300_classes.sql:380', 'api/account.js:70'],
      },
      {
        text: 'What a teacher or administrator looks at is not recorded. Mindful keeps no log of who viewed whose figures.',
        sources: ['supabase/SECURITY.md:332'],
      },
    ],
  },
  {
    heading: 'The AI reading',
    items: [
      {
        text: 'Nothing is sent to an AI unless you press “Write the reading”. Then Mindful’s server sends Anthropic figures about your record — counts, averages and dates — with your habits and emotions labelled “Habit 1”, “Emotion 2” and so on. Nothing you typed is sent, and the server refuses the request if anything else is in it. Your name, email address and account are not sent. The app only ever asks for a reading of your own record, and the server refuses a request that names anyone else.',
        sources: ['src/backend/services/report/insights.js:510', 'api/_lib/figures.js:46', 'api/report.js:128', 'api/report.js:235'],
      },
      {
        text: 'How Anthropic handles what it receives through its API is set out in',
        link: { href: 'https://www.anthropic.com/legal/privacy', label: 'Anthropic’s privacy policy' },
        sources: ['api/report.js:235'],
      },
    ],
  },
  {
    heading: 'Other services your browser talks to',
    items: [
      {
        text: 'Supabase, for signing in and for your data. Vercel, which hosts the site and its server functions; like any web host, it receives your IP address with each request. Google Fonts, which supplies the typefaces, so Google receives your IP address when a page loads its fonts.',
        sources: ['src/config/env.js:8', 'vercel.json:2', 'index.html:166'],
      },
      {
        text: 'Mindful has no advertising and no analytics or tracking scripts.',
        sources: ['index.html:166', 'package.json:1'],
      },
    ],
  },
  {
    heading: 'On this device',
    items: [
      {
        text: 'Your browser keeps your signed-in session, your appearance and chart settings, your local-storage choice and any campaign tags from the link you arrived by. “Clear this device” in Preferences removes all but the session; signing out removes that.',
        sources: ['src/shared/constants/storage.js:6', 'src/backend/database/client.js:41', 'src/frontend/pages/Settings.jsx:88'],
      },
    ],
  },
  {
    heading: 'Keeping, copying and deleting',
    items: [
      {
        text: 'Preferences → “Take a copy” downloads everything in your journal as a file.',
        sources: ['src/backend/services/account.js:29'],
      },
      {
        text: '“Delete written data” removes your moods, habits and thought records and keeps the account.',
        sources: ['src/backend/services/account.js:62'],
      },
      {
        text: '“Deactivate” switches the account off and keeps everything you wrote; you leave your classes, and only an administrator can switch it back on.',
        sources: ['supabase/migrations/20260911000700_self_service_deactivation.sql:47'],
      },
      {
        text: '“Delete account” permanently removes your account, profile, journal, class memberships and reading records. If your role was ever changed, the record of that change (account ID, old and new role, who changed it, when and why) is kept. Copies can remain in backups kept by whoever runs Mindful for up to 30 days after you delete.',
        sources: ['api/account.js:70', 'supabase/migrations/20260911000100_baseline_production.sql:103', 'supabase/migrations/20260911000200_roles.sql:56'],
      },
    ],
  },
]
