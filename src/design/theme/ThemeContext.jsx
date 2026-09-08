import { createContext, useContext, useEffect, useState } from 'react'
import { deriveFullPalette } from '../tokens/palette'
import { STORAGE_KEYS } from '@shared/constants/storage'

const ThemeContext = createContext(null)

// These four keys are also read by the pre-paint script in index.html, which
// cannot import anything. Changing one here means changing it there too — see
// AGENT_RULES.md § Files that cannot be separated.
const STORAGE_KEY = STORAGE_KEYS.theme
const ACCENT_STORAGE_KEY = STORAGE_KEYS.accentColor
const DENSITY_KEY = STORAGE_KEYS.density
const MOTION_KEY = STORAGE_KEYS.reduceMotion

export const DEFAULT_ACCENT = { light: '#9a3b1f', dark: '#e0714f' }

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialAccent() {
  return localStorage.getItem(ACCENT_STORAGE_KEY) || null
}

function getInitialDensity() {
  return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'
}

function getInitialReduceMotion() {
  return localStorage.getItem(MOTION_KEY) === 'true'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)
  const [accentColor, setAccentColorState] = useState(getInitialAccent)
  const [density, setDensityState] = useState(getInitialDensity)
  const [reduceMotion, setReduceMotionState] = useState(getInitialReduceMotion)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement.style
    if (accentColor) {
      const palette = deriveFullPalette(accentColor, theme)
      root.setProperty('--bg', palette.bg)
      root.setProperty('--surface', palette.surface)
      root.setProperty('--text', palette.text)
      root.setProperty('--muted', palette.muted)
      root.setProperty('--border', palette.border)
      root.setProperty('--rule', palette.rule)
      root.setProperty('--accent', palette.accent)
      root.setProperty('--accent-hover', palette.accentHover)
      root.setProperty('--accent-contrast', palette.accentContrast)
      localStorage.setItem(ACCENT_STORAGE_KEY, accentColor)
    } else {
      ;['--bg', '--surface', '--text', '--muted', '--border', '--rule', '--accent', '--accent-hover', '--accent-contrast'].forEach((prop) => root.removeProperty(prop))
      localStorage.removeItem(ACCENT_STORAGE_KEY)
    }
  }, [accentColor, theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
    localStorage.setItem(DENSITY_KEY, density)
  }, [density])

  useEffect(() => {
    document.documentElement.setAttribute('data-motion', reduceMotion ? 'reduced' : 'auto')
    localStorage.setItem(MOTION_KEY, String(reduceMotion))
  }, [reduceMotion])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  function setAccentColor(hex) {
    setAccentColorState(hex)
  }

  function resetAccentColor() {
    setAccentColorState(null)
  }

  function setDensity(value) {
    setDensityState(value === 'compact' ? 'compact' : 'comfortable')
  }

  function setReduceMotion(value) {
    setReduceMotionState(Boolean(value))
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        accentColor,
        setAccentColor,
        resetAccentColor,
        density,
        setDensity,
        reduceMotion,
        setReduceMotion,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
