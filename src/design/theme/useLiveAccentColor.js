import { useMemo } from 'react'
import { useTheme, DEFAULT_ACCENT } from './ThemeContext'
import { deriveAccentForTheme } from '@design/tokens/palette'

// Computed directly from theme/accentColor state rather than read back from
// the DOM — avoids a real ordering race where a consumer's effect could run
// before ThemeContext's effect has written the updated CSS custom property.
export default function useLiveAccentColor() {
  const { theme, accentColor } = useTheme()
  return useMemo(
    () => (accentColor ? deriveAccentForTheme(accentColor, theme) : DEFAULT_ACCENT[theme]),
    [accentColor, theme],
  )
}
