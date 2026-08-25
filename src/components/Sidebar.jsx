import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { to: '/mood', label: 'Mood', icon: '☺' },
  { to: '/habits', label: 'Habits', icon: '✓' },
  { to: '/thoughts', label: 'Thought Records', icon: '✎' },
  { to: '/faq', label: 'FAQ', icon: '?' },
]

export default function Sidebar({ onSearchClick, mobileOpen, onMobileClose }) {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err.message)
    }
  }

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <NavLink to="/dashboard" className="brand" onClick={onMobileClose}>
            Mindful
          </NavLink>
          <button
            type="button"
            className="sidebar-close"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onMobileClose}
            >
              <span className="sidebar-link-icon" aria-hidden="true">
                {link.icon}
              </span>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-icons">
            <button type="button" className="icon-btn" onClick={onSearchClick} aria-label="Search">
              🔍
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
            <NavLink to="/settings" className="icon-btn" aria-label="Settings" onClick={onMobileClose}>
              ⚙
            </NavLink>
          </div>
          <button type="button" className="btn-ghost sidebar-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
