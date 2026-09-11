import { NavLink } from 'react-router-dom'
import { useAuth } from '@backend/auth/AuthContext'
import { useTheme } from '@design/theme/ThemeContext'
import Icon from '@design/primitives/Icon'

// The book's index. Every destination is a numbered entry with a hairline
// under it; the one you're reading is a solid block of ink.
const ENTRIES = [
  { to: '/dashboard', label: 'Day sheet', icon: 'sheet' },
  { to: '/mood', label: 'Mood', icon: 'gauge' },
  { to: '/habits', label: 'Register', icon: 'register' },
  { to: '/thoughts', label: 'Case notes', icon: 'quill' },
  { to: '/report', label: 'The reading', icon: 'reading' },
  { to: '/faq', label: 'Marginalia', icon: 'marginalia' },
  { to: '/settings', label: 'Preferences', icon: 'dial' },
  { to: '/classes', label: 'Class register', icon: 'register' },
]

// Shown only to administrators. The page behind it refuses everybody else at
// the database, so this is about not offering a door that does not open.
const ADMIN_ENTRY = { to: '/admin', label: 'Register of hands', icon: 'shield' }

export default function IndexRail({ onSearchClick, mobileOpen, onMobileClose }) {
  const { isAdmin, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const entries = isAdmin ? [...ENTRIES, ADMIN_ENTRY] : ENTRIES

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err.message)
    }
  }

  return (
    <>
      {mobileOpen && <div className="rail-backdrop" onClick={onMobileClose} />}
      <aside className={`rail ${mobileOpen ? 'open' : ''}`}>
        <div className="rail-head">
          <NavLink to="/dashboard" className="wordmark" onClick={onMobileClose}>
            <span className="wordmark-name">
              Mind<em>ful</em>
            </span>
            <span className="wordmark-sub">The Almanac</span>
          </NavLink>
          <button type="button" className="rail-close" onClick={onMobileClose} aria-label="Close index">
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="rail-nav" aria-label="Sections">
          {entries.map((entry, i) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}
              onClick={onMobileClose}
            >
              <span className="rail-link-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="rail-link-label">{entry.label}</span>
              <Icon name={entry.icon} size={15} className="rail-link-icon" />
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot">
          <div className="rail-tools">
            <button type="button" className="icon-btn" onClick={onSearchClick} aria-label="Search">
              <Icon name="search" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light paper' : 'Switch to dark ink'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <button type="button" className="icon-btn" onClick={handleSignOut} aria-label="Sign out">
              <Icon name="exit" size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
