const HOVER_MIX_WEIGHT = 0.18
const LIGHT_LUMINANCE_THRESHOLD = 0.45
const DEFAULT_HUE = 32 // matches the almanac's default warm paper/ink hue

export function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function rgbToHex({ r, g, b }) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

function mix(rgb, target, weight) {
  return {
    r: rgb.r + (target.r - rgb.r) * weight,
    g: rgb.g + (target.g - rgb.g) * weight,
    b: rgb.b + (target.b - rgb.b) * weight,
  }
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  // Hue is undefined when delta≈0 (grays) — fall back to a fixed default hue
  // instead of letting the math default to red.
  if (delta < 0.001) return { h: DEFAULT_HUE, s: 0, l: l * 100 }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h *= 60
  if (h < 0) h += 360

  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }) {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let rgb
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 }
}

export function hslToHex(hsl) {
  return rgbToHex(hslToRgb(hsl))
}

export function hexToHsl(hex) {
  return rgbToHsl(hexToRgb(hex))
}

const INK = '#141310'
const PAPER = '#fbf9f3'

export function deriveAccentPalette(hex) {
  const rgb = hexToRgb(hex)
  const isLight = relativeLuminance(rgb) > LIGHT_LUMINANCE_THRESHOLD
  // Whichever of ink/paper actually reads better ON this accent wins — a
  // fixed luminance cutoff picks paper-on-mid-tone pairs that fail 4.5:1.
  const contrast =
    contrastRatio(rgb, hexToRgb(INK)) >= contrastRatio(rgb, hexToRgb(PAPER)) ? INK : PAPER
  const hoverTarget = isLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const hover = rgbToHex(mix(rgb, hoverTarget, HOVER_MIX_WEIGHT))
  return { accent: hex, accentHover: hover, accentContrast: contrast }
}

// Resynthesizes an accent for the OTHER theme than the one it was picked
// under — a light-tuned accent hex reused verbatim in dark mode reads too
// dark/muddy against the dark neomorphic shadows, and vice versa.
// Resynthesizes an accent for the OTHER theme than the one it was picked
// under — a light-tuned accent hex reused verbatim against a near-black ink
// field reads muddy, and a dark-tuned one washes out on paper.
export function deriveAccentForTheme(baseHex, theme) {
  const { h, s } = hexToHsl(baseHex)
  const target =
    theme === 'dark'
      ? { h, s: Math.max(s, 62), l: 64 }
      : { h, s: Math.min(Math.max(s, 52), 72), l: 36 }
  return hslToHex(target)
}

// Fixed role targets for the paper-and-ink system (see index.css). Only hue
// is taken from the user's chosen color — saturation and lightness per role
// stay pinned so an arbitrary hue can't produce a garish or illegible page.
// `rule` is the heavier hairline used for structural dividers; `border` is
// the lighter one used inside panels.
const ROLE_TARGETS = {
  light: {
    bg: { s: 20, l: 94 },
    surface: { s: 30, l: 97.5 },
    text: { s: 24, l: 9 },
    muted: { s: 10, l: 40 },
    border: { s: 14, l: 79 },
    rule: { s: 14, l: 66 },
  },
  dark: {
    bg: { s: 12, l: 6 },
    surface: { s: 11, l: 10 },
    text: { s: 16, l: 93 },
    muted: { s: 9, l: 58 },
    border: { s: 10, l: 24 },
    rule: { s: 12, l: 34 },
  },
}

function clampTextContrast(textHsl, bgHsl) {
  const textRgb = hslToRgb(textHsl)
  const bgRgb = hslToRgb(bgHsl)
  if (contrastRatio(textRgb, bgRgb) >= 4.5) return textHsl
  const nudged = { ...textHsl, l: textHsl.l < bgHsl.l ? Math.max(textHsl.l - 3, 0) : Math.min(textHsl.l + 3, 100) }
  return nudged
}

export function deriveFullPalette(baseHex, theme) {
  const { h } = hexToHsl(baseHex)
  const roles = ROLE_TARGETS[theme]

  const bg = { h, s: roles.bg.s, l: roles.bg.l }
  const text = clampTextContrast({ h, s: roles.text.s, l: roles.text.l }, bg)

  const accentHex = deriveAccentForTheme(baseHex, theme)
  const { accent, accentHover, accentContrast } = deriveAccentPalette(accentHex)

  return {
    bg: hslToHex(bg),
    surface: hslToHex({ h, s: roles.surface.s, l: roles.surface.l }),
    text: hslToHex(text),
    muted: hslToHex({ h, s: roles.muted.s, l: roles.muted.l }),
    border: hslToHex({ h, s: roles.border.s, l: roles.border.l }),
    rule: hslToHex({ h, s: roles.rule.s, l: roles.rule.l }),
    accent,
    accentHover,
    accentContrast,
  }
}
