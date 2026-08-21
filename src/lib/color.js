const HOVER_MIX_WEIGHT = 0.16
const LIGHT_LUMINANCE_THRESHOLD = 0.45
const DEFAULT_HUE = 210 // matches the app's original blue-gray default

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

export function deriveAccentPalette(hex) {
  const rgb = hexToRgb(hex)
  const isLight = relativeLuminance(rgb) > LIGHT_LUMINANCE_THRESHOLD
  const contrast = isLight ? '#182029' : '#ffffff'
  const hoverTarget = isLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const hover = rgbToHex(mix(rgb, hoverTarget, HOVER_MIX_WEIGHT))
  return { accent: hex, accentHover: hover, accentContrast: contrast }
}

// Resynthesizes an accent for the OTHER theme than the one it was picked
// under — a light-tuned accent hex reused verbatim in dark mode reads too
// dark/muddy against the dark neomorphic shadows, and vice versa.
export function deriveAccentForTheme(baseHex, theme) {
  const { h, s } = hexToHsl(baseHex)
  const target =
    theme === 'dark' ? { h, s: Math.max(s, 60), l: 70 } : { h, s: Math.min(Math.max(s, 45), 55), l: 37 }
  return hslToHex(target)
}

// Fixed role targets reverse-engineered from the app's own default palette
// (index.css). Only hue is taken from the user's chosen color — saturation
// and lightness per role stay pinned so an arbitrary hue can't produce a
// garish or illegible result.
const ROLE_TARGETS = {
  light: {
    bg: { s: 25, l: 92 },
    text: { s: 28, l: 28 },
    muted: { s: 16, l: 51 },
    shadowDark: { s: 20, l: 77 },
    shadowDarkStrong: { s: 19, l: 71 },
  },
  dark: {
    bg: { s: 21, l: 21 },
    text: { s: 28, l: 93 },
    muted: { s: 21, l: 65 },
    shadowLight: { s: 21, l: 25.5 },
    shadowDark: { s: 22, l: 14 },
    shadowDarkStrong: { s: 22, l: 10 },
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
  const muted = { h, s: roles.muted.s, l: roles.muted.l }
  const shadowDark = { h, s: roles.shadowDark.s, l: roles.shadowDark.l }
  const shadowDarkStrong = { h, s: roles.shadowDarkStrong.s, l: roles.shadowDarkStrong.l }
  const shadowLight = theme === 'dark' ? { h, s: roles.shadowLight.s, l: roles.shadowLight.l } : null

  const accentHex = deriveAccentForTheme(baseHex, theme)
  const { accent, accentHover, accentContrast } = deriveAccentPalette(accentHex)

  return {
    bg: hslToHex(bg),
    surface: hslToHex(bg),
    text: hslToHex(text),
    muted: hslToHex(muted),
    shadowLight: theme === 'dark' ? hslToHex(shadowLight) : '#ffffff',
    shadowDark: hslToHex(shadowDark),
    shadowDarkStrong: hslToHex(shadowDarkStrong),
    accent,
    accentHover,
    accentContrast,
  }
}
