import { useTheme } from './ThemeContext'
import ThemeColorSwatches from './ThemeColorSwatches'

// The appearance block of the settings page: stock, leading, motion, ink.
//
// It lives in design/ rather than in the page because every control here writes
// to ThemeContext and nothing else — there is no account state, no database, no
// routing. Lifting it out means how the book is set can change without opening
// a file that also contains password changes and data deletion. The page
// decides where this block sits; this file decides what is inside it.
//
// `Switch` is passed in rather than imported so the page keeps its own form
// vocabulary, and design/ never has to import from frontend/.
export default function AppearanceSettings({ Switch }) {
  const { theme, toggleTheme, density, setDensity, reduceMotion, setReduceMotion } = useTheme()

  return (
    <div className="ledger">
      <div className="ledger-row">
        <div className="ledger-label">
          <strong>Stock</strong>
          <p>Print on warm paper, or reverse the whole book out onto black.</p>
        </div>
        <Switch
          label="Paper stock"
          value={theme}
          onChange={(v) => (v === theme ? null : toggleTheme())}
          options={[
            { value: 'light', label: 'Paper' },
            { value: 'dark', label: 'Ink' },
          ]}
        />
      </div>

      <div className="ledger-row">
        <div className="ledger-label">
          <strong>Leading</strong>
          <p>Tighter spacing throughout — more on the page, less air between it.</p>
        </div>
        <Switch
          label="Layout density"
          value={density}
          onChange={setDensity}
          options={[
            { value: 'comfortable', label: 'Open' },
            { value: 'compact', label: 'Tight' },
          ]}
        />
      </div>

      <div className="ledger-row">
        <div className="ledger-label">
          <strong>Motion</strong>
          <p>Stop everything from animating, independently of your system setting.</p>
        </div>
        <Switch
          label="Reduce motion"
          value={reduceMotion ? 'on' : 'off'}
          onChange={(v) => setReduceMotion(v === 'on')}
          options={[
            { value: 'off', label: 'Allowed' },
            { value: 'on', label: 'Stilled' },
          ]}
        />
      </div>

      <div className="ledger-row ledger-row-stacked">
        <div className="ledger-label">
          <strong>Ink</strong>
          <p>
            Pick a color and the whole book is re-derived from its hue — paper, rules, text, and
            every mark on it.
          </p>
        </div>
        <ThemeColorSwatches />
      </div>
    </div>
  )
}
