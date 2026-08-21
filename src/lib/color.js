const HOVER_MIX_WEIGHT = 0.16
const LIGHT_LUMINANCE_THRESHOLD = 0.45

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

function mix(rgb, target, weight) {
  return {
    r: rgb.r + (target.r - rgb.r) * weight,
    g: rgb.g + (target.g - rgb.g) * weight,
    b: rgb.b + (target.b - rgb.b) * weight,
  }
}

export function deriveAccentPalette(hex) {
  const rgb = hexToRgb(hex)
  const isLight = relativeLuminance(rgb) > LIGHT_LUMINANCE_THRESHOLD
  const contrast = isLight ? '#182029' : '#ffffff'
  const hoverTarget = isLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  const hover = rgbToHex(mix(rgb, hoverTarget, HOVER_MIX_WEIGHT))
  return { accent: hex, accentHover: hover, accentContrast: contrast }
}
