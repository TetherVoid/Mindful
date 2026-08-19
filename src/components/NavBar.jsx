import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/mood', label: 'Mood' },
  { to: '/habits', label: 'Habits' },
  { to: '/thoughts', label: 'Thought Records' },
  { to: '/faq', label: 'FAQ' },
]

export default function NavBar({ onSearchClick }) {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err.message)
    }
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <NavLink to="/dashboard" className="brand">
          Mindful
        </NavLink>

        <nav className={`main-nav ${menuOpen ? 'open' : ''}`}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
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
          <button type="button" className="btn-ghost" onClick={handleSignOut}>
            Sign out
          </button>
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
        </div>
      </div>
    </header>
  )
}
