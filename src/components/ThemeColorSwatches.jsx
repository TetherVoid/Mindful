import { useTheme, DEFAULT_ACCENT } from '../context/ThemeContext'

const PRESETS = [
  { name: 'Ocean', value: '#2f6f8f' },
  { name: 'Forest', value: '#3f7d52' },
  { name: 'Plum', value: '#7a4f9e' },
  { name: 'Rose', value: '#b5566f' },
  { name: 'Amber', value: '#c1812f' },
  { name: 'Slate', value: '#5b6b7a' },
]

export default function ThemeColorSwatches() {
  const { theme, accentColor, setAccentColor, resetAccentColor } = useTheme()

  return (
    <div className="theme-swatches">
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
            aria-label="Pick a custom theme color"
          />
        </label>
      </div>
      <button type="button" className="btn-ghost color-picker-reset" onClick={resetAccentColor}>
        Reset to default
      </button>
    </div>
  )
}
