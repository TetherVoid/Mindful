// Every answer about privacy below is a promise about the database, and has to
// match what supabase/SECURITY.md says the functions return. If the access
// model changes, change these in the same commit.
//
// The first answer is built from shared/constants/support.js so the numbers
// here can never differ from the ones printed at the foot of every page.
import { SUPPORT_LINES } from '@shared/constants/support'

const telemanas = SUPPORT_LINES.find((line) => line.id === 'telemanas')
const childline = SUPPORT_LINES.find((line) => line.id === 'childline')
const emergency = SUPPORT_LINES.find((line) => line.id === 'emergency')

export const faqItems = [
  {
    question: 'I need to talk to someone now. Who can I call?',
    answer: `Call ${telemanas.name} on ${telemanas.number} (or ${telemanas.alternate.number}) — it is the government’s free mental health helpline, open any time, and you can choose your language. If you are under 18, the ${childline.name} on ${childline.number} is also there any time. If you are in danger right now, call ${emergency.number}. Telling a teacher, a parent, or a doctor you trust counts too. This app does not watch what you write and will never contact anyone on your behalf, so reaching out has to come from you — and it is always the right thing to do.`,
  },
  {
    question: 'What is a thought record?',
    answer:
      'A thought record is a CBT (cognitive behavioural therapy) exercise where you write down a situation that triggered a strong emotion, the automatic thought you had, evidence for and against that thought, and a more balanced alternative thought.',
  },
  {
    question: 'How is my mood score used?',
    answer:
      'Each mood entry is a 1–5 self-rating plus an optional note. Over time these build into a trend line on the Mood page so you can spot patterns in how you feel.',
  },
  {
    question: 'Who can see my data?',
    answer:
      'Only you can read what you write. Your mood notes, your thought records and the names of your habits are never shown to any other person — not your teachers, and not the school’s administrators. If you switch on “Share figures with teachers” in Preferences, then while you are in a class, its teachers and the school’s administrators can see figures about your record: how many moods you logged, the score of each one and the day it was on, your average, how many habits you have and how often you ticked each, how many thought records you wrote, and the day you last wrote something — never the time. They never see your words. Sharing is off until you switch it on, and switching it off stops it straight away. When a class is archived, its teachers stop seeing figures through it.',
  },
  {
    question: 'Can my teacher see what I write?',
    answer:
      'No. Teachers never see your notes, your thought records or the names of your habits. If you have switched sharing on, they see only the figures described under “Who can see my data?” — and if you have not, they see nothing about you except that you have joined their class.',
  },
  {
    question: 'How do I stop sharing with teachers?',
    answer:
      'Go to Preferences, find “Share figures with teachers” under Profile & visibility, choose Private, and press Save profile. It takes effect straight away, for every teacher and administrator.',
  },
  {
    question: 'Does anything I write go to an AI?',
    answer:
      'Nothing you typed ever does. If you press “Write the reading” on The Reading page, numbers are sent to Anthropic’s API to write it up — counts, averages and dates — with your habits and emotions labelled “Habit 1”, “Emotion 2” and so on, never by the names you gave them. They are not stored by this app, and your own names are put back into the reading on your device. Your notes and thought records never leave your device at all. “Write it here instead” makes the same page without sending anything.',
  },
  {
    question: 'How do I download or delete everything?',
    answer:
      'In Preferences, under Data & privacy, the Export button beside “Take a copy” downloads everything you have written as a file. Under Permanent actions you can delete everything you have written and keep your account, or delete your account and everything in it. Deleting cannot be undone, so take a copy first if you might want it.',
  },
  {
    question: 'Can I access this from another device?',
    answer:
      'Yes — your data is stored in your account (via Supabase), not just in this browser, so signing in from another device shows the same data.',
  },
]
