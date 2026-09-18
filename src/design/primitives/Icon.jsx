// A single hand-tuned stroke icon set, drawn on a 24px grid at a constant
// 1.5px weight so icons sit at the same optical weight as the hairline rules
// they live between. Replaces the emoji the app used to use as icons: emoji
// render in the OS's own color/style, ignore the theme, and read as content
// rather than as interface.

const PATHS = {
  // Nav
  sheet: (
    <>
      <path d="M4.5 3.5h15v17h-15z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  gauge: (
    <>
      <path d="M3.5 18a8.5 8.5 0 0 1 17 0" />
      <path d="M12 18l4.5-6" />
      <path d="M3.5 18h17" />
    </>
  ),
  register: (
    <>
      <path d="M4.5 3.5h15v17h-15z" />
      <path d="M8 8.5l1.6 1.6L12.5 7" />
      <path d="M8 15.5l1.6 1.6L12.5 14" />
      <path d="M15 9h2M15 16h2" />
    </>
  ),
  // Two figures, the second occluded: only the right half of its head and
  // shoulder is drawn, which is what puts it behind the first rather than
  // beside it. The front figure is the same head-and-shoulders construction
  // at the same 1.5 weight as the rest of the set.
  cohort: (
    <>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2.5 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M16.5 4.4a3.5 3.5 0 0 1 0 6.2" />
      <path d="M18 14.2a4.5 4.5 0 0 1 3.5 4.3V20" />
    </>
  ),
  quill: (
    <>
      <path d="M4 20s1.5-6 6.5-11S20 3.5 20 3.5s.5 6-4 10.5S4 20 4 20Z" />
      <path d="M7.5 16.5c2-2 4-3.5 6.5-5" />
    </>
  ),
  marginalia: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5" />
      <path d="M12 16.6v.01" />
    </>
  ),
  reading: (
    <>
      <path d="M3.5 5.5h6a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2h-6.5Z" />
      <path d="M20.5 5.5h-6A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6.5Z" />
      <path d="M15 9.5h3M15 12.5h3" />
    </>
  ),
  dial: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </>
  ),

  // Tools
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.4 15.4 20 20" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />,
  mail: (
    <>
      <path d="M3.5 5.5h17v13h-17z" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrowRight: (
    <>
      <path d="M4 12h15" />
      <path d="m13.5 6.5 6 5.5-6 5.5" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 20V5" />
      <path d="m5.5 11.5 6.5-6.5 6.5 6.5" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: (
    <>
      <path d="M8.5 8.5h11v11h-11z" />
      <path d="M15.5 5.5h-11v11" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V4h6v2.5" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11" />
      <path d="m7 10 5 4.5 5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  lock: (
    <>
      <path d="M5.5 10.5h13v10h-13z" />
      <path d="M8.5 10.5V7.2a3.5 3.5 0 0 1 7 0v3.3" />
    </>
  ),
  exit: (
    <>
      <path d="M14.5 4.5h-9v15h9" />
      <path d="M11 12h9" />
      <path d="m16.5 8 3.5 4-3.5 4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
}

export default function Icon({ name, size = 18, stroke = 1.5, className, title }) {
  const path = PATHS[name]
  if (!path) return null

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {path}
    </svg>
  )
}

// The five mood faces, drawn rather than typed. `score` runs 1–5; the mouth
// curve interpolates across the range so the set reads as one continuous
// gauge instead of five unrelated glyphs.
export function MoodFace({ score, size = 26, stroke = 1.5 }) {
  const curve = { 1: 5, 2: 2.5, 3: 0, 4: -2.5, 5: -5 }[score] ?? 0
  const mouth =
    curve === 0
      ? 'M8.5 15.5h7'
      : `M8.5 ${15.5 + curve / 2} Q12 ${15.5 - curve * 1.1} 15.5 ${15.5 + curve / 2}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d={`M8.6 ${score >= 4 ? '9.6' : '9.2'}v${score === 1 ? 1.6 : 1.2}`} />
      <path d={`M15.4 ${score >= 4 ? '9.6' : '9.2'}v${score === 1 ? 1.6 : 1.2}`} />
      <path d={mouth} />
    </svg>
  )
}
