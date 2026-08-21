import { createContext, useContext, useEffect, useState } from 'react'
import { deriveAccentPalette } from '../lib/color'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'theme'
const ACCENT_STORAGE_KEY = 'accentColor'

export const DEFAULT_ACCENT = { light: '#2f6f8f', dark: '#7fc8e8' }

function getInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialAccent() {
  return localStorage.getItem(ACCENT_STORAGE_KEY) || null
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)
  const [accentColor, setAccentColorState] = useState(getInitialAccent)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement.style
    if (accentColor) {
      const { accent, accentHover, accentContrast } = deriveAccentPalette(accentColor)
      root.setProperty('--accent', accent)
      root.setProperty('--accent-hover', accentHover)
      root.setProperty('--accent-contrast', accentContrast)
      localStorage.setItem(ACCENT_STORAGE_KEY, accentColor)
    } else {
      root.removeProperty('--accent')
      root.removeProperty('--accent-hover')
      root.removeProperty('--accent-contrast')
      localStorage.removeItem(ACCENT_STORAGE_KEY)
    }
  }, [accentColor])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  function setAccentColor(hex) {
    setAccentColorState(hex)
  }

  function resetAccentColor() {
    setAccentColorState(null)
  }

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, accentColor, setAccentColor, resetAccentColor }}
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
