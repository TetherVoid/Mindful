import { useTheme, DEFAULT_ACCENT } from './ThemeContext'

// Named after the inks they imitate — the whole page is re-derived from the
// chosen hue, so these are stock, not just a button color.
const INKS = [
  { name: 'Vermillion', value: '#9a3b1f' },
  { name: 'Iron gall', value: '#2f4a6b' },
  { name: 'Verdigris', value: '#3f7d52' },
  { name: 'Aubergine', value: '#6b3f7d' },
  { name: 'Ochre', value: '#a8762a' },
  { name: 'Graphite', value: '#5b5a52' },
]

export default function ThemeColorSwatches() {
  const { theme, accentColor, setAccentColor, resetAccentColor } = useTheme()

  return (
    <div>
      <div className="swatch-row">
        {INKS.map((ink) => (
          <button
            key={ink.value}
            type="button"
            className={`swatch ${accentColor === ink.value ? 'selected' : ''}`}
            style={{ background: ink.value }}
            onClick={() => setAccentColor(ink.value)}
            aria-label={ink.name}
            aria-pressed={accentColor === ink.value}
            title={ink.name}
          />
        ))}
        <label className="swatch swatch-custom" title="Mix your own">
          <input
            type="color"
            value={accentColor || DEFAULT_ACCENT[theme]}
            onChange={(e) => setAccentColor(e.target.value)}
            aria-label="Mix a custom ink"
          />
        </label>
      </div>
      <button type="button" className="btn btn--quiet btn--sm" onClick={resetAccentColor}>
        Reset to house ink
      </button>
    </div>
  )
}
