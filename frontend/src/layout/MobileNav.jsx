import { NavLink } from 'react-router-dom';

import { NAV_LINKS } from './navigation.js';

const PRIMARY_LINKS = NAV_LINKS.slice(0, 4);

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    background: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'stretch',
    zIndex: 200,
  },
};

const linkBase = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  textDecoration: 'none',
  color: 'var(--color-text-muted)',
  fontSize: '0.65rem',
  fontWeight: 500,
  transition: 'color var(--transition-fast)',
};

export default function MobileNav() {
  return (
    <nav style={styles.nav} className="mobile-nav" aria-label="Bottom navigation">
      {PRIMARY_LINKS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={({ isActive }) => ({
            ...linkBase,
            color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
          })}
        >
          <span style={{ fontSize: '1.2rem' }}>{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
