import { NavLink } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';

import { NAV_LINKS } from './navigation.js';

const styles = {
  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: 'var(--sidebar-width)',
    height: '100vh',
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    padding: '0 0 1rem 0',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1.25rem 1.25rem 1rem',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: '0.5rem',
  },
  brandIcon: { fontSize: '1.4rem' },
  brandName: { fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' },
  brandSub: { fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 0.5rem' },
  themeArea: {
    marginTop: 'auto',
    padding: '0.75rem 0.75rem 0',
    borderTop: '1px solid var(--color-border)',
  },
  themeBtn: {
    width: '100%',
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
  },
};

const linkBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.5rem 0.75rem',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-secondary)',
  fontSize: '0.9rem',
  fontWeight: 500,
  textDecoration: 'none',
  transition: 'background var(--transition-fast), color var(--transition-fast)',
};

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside style={styles.sidebar} className="sidebar-desktop" role="navigation" aria-label="Main navigation">
      <div style={styles.brand}>
        <span style={styles.brandIcon}>⚖️</span>
        <div>
          <span style={styles.brandName}>ISA Truth</span>
          <span style={styles.brandSub}>ISA vs Loan Analyser</span>
        </div>
      </div>

      <nav style={styles.nav}>
        {NAV_LINKS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
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
      </nav>

      <div style={styles.themeArea}>
        <button style={styles.themeBtn} onClick={toggleTheme} aria-label="Toggle colour theme">
          <span>Theme</span>
          <span className="theme-name">{theme}</span>
        </button>
      </div>
    </aside>
  );
}
