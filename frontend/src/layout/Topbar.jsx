import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';

import { NAV_LINKS } from './navigation.js';

const styles = {
  topbar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: 'var(--topbar-height)',
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 1rem',
    gap: '0.75rem',
    zIndex: 200,
  },
  brand: {
    fontWeight: 700,
    fontSize: '1rem',
    color: 'var(--color-text-primary)',
    flex: 1,
  },
  hamburger: {
    background: 'none',
    border: 'none',
    fontSize: '1.4rem',
    color: 'var(--color-text-primary)',
    display: 'flex',
    alignItems: 'center',
    padding: '0.25rem',
  },
  drawer: {
    position: 'fixed',
    top: 'var(--topbar-height)',
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 150,
  },
  drawerContent: {
    background: 'var(--color-surface)',
    width: '240px',
    height: '100%',
    padding: '1rem 0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  themeBtn: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-secondary)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    width: '100%',
  },
};

const linkBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.6rem 0.75rem',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)',
  fontSize: '0.95rem',
  fontWeight: 500,
  textDecoration: 'none',
};

export default function Topbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <header style={styles.topbar} className="topbar-mobile">
        <button style={styles.hamburger} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? '✕' : '☰'}
        </button>
        <span style={styles.brand}>⚖️ ISA Truth</span>
        <button
          style={{ ...styles.hamburger, fontSize: '1.2rem' }}
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'coffee' ? '☕' : theme === 'dark' ? '🌙' : '☀️'}
        </button>
      </header>

      {open && (
        <div style={styles.drawer} onClick={() => setOpen(false)}>
          <nav style={{ ...styles.drawerContent, overflowY: 'auto' }} aria-label="Main navigation" onClick={(e) => e.stopPropagation()}>
            {NAV_LINKS.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setOpen(false)}
                style={({ isActive }) => ({
                  ...linkBase,
                  background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                })}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </NavLink>
            ))}
            <button style={styles.themeBtn} onClick={toggleTheme}>
              <span>Theme</span>
              <span className="theme-name">{theme}</span>
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
