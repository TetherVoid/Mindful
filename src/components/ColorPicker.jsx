import { useEffect, useRef, useState } from 'react'
import { useTheme, DEFAULT_ACCENT } from '../context/ThemeContext'

const PRESETS = [
  { name: 'Ocean', value: '#2f6f8f' },
  { name: 'Forest', value: '#3f7d52' },
  { name: 'Plum', value: '#7a4f9e' },
  { name: 'Rose', value: '#b5566f' },
  { name: 'Amber', value: '#c1812f' },
  { name: 'Slate', value: '#5b6b7a' },
]

export default function ColorPicker() {
  const { theme, accentColor, setAccentColor, resetAccentColor } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="color-picker" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Customize accent color"
        aria-expanded={open}
      >
        🎨
      </button>
      {open && (
        <div className="color-picker-panel card">
          <p className="color-picker-label">Accent color</p>
          <div className="color-swatch-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`color-swatch ${accentColor === preset.value ? 'selected' : ''}`}
                style={{ background: preset.value }}
                onClick={() => setAccentColor(preset.value)}
                aria-label={preset.name}
                title={preset.name}
              />
            ))}
            <label className="color-swatch color-swatch-custom" title="Custom color">
              <input
                type="color"
                value={accentColor || DEFAULT_ACCENT[theme]}
                onChange={(e) => setAccentColor(e.target.value)}
                aria-label="Pick a custom accent color"
              />
            </label>
          </div>
          <button type="button" className="btn-ghost color-picker-reset" onClick={resetAccentColor}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  )
}
