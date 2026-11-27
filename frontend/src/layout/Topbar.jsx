import { useEffect, useRef, useState } from 'react';
import { Menu, Scale, UserRound, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ABOUT_LINK, matchesNavigation, NAV_ICON_PROPS, NAV_LINKS } from './navigation.js';
import NavigationLink from './NavigationLink.jsx';
import ThemePicker from './ThemePicker.jsx';
import { useAccount } from '../account/AccountProvider.jsx';

const ACCOUNT_TITLES = { '/sign-in': 'Sign in', '/sign-up': 'Sign up', '/profile': 'Account' };
const DRAWER_LINKS = [...NAV_LINKS, ABOUT_LINK];

export default function Topbar() {
  const { pathname } = useLocation();
  const { profile } = useAccount();
  const drawer = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const activePage = DRAWER_LINKS.find((item) => matchesNavigation(item, pathname));
  const ActiveIcon = activePage?.Icon ?? (ACCOUNT_TITLES[pathname] ? UserRound : Scale);
  const accountLabel = profile ? 'Account' : 'Sign in';

  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia('(width > 900px)');
    const closeOnDesktop = (event) => {
      if (event.matches) drawer.current?.close();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  function openMenu() {
    drawer.current.showModal();
    setMenuOpen(true);
  }

  return (
    <>
      <header className="shell-topbar">
        <button
          type="button"
          className="shell-icon-action shell-menu-trigger"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-controls="mobile-navigation-drawer"
          aria-expanded={menuOpen}
          onClick={openMenu}
        >
          <Menu {...NAV_ICON_PROPS} />
        </button>
        <Link to="/" className="shell-brand shell-mobile-brand">
          <span className="shell-brand-mark"><Scale {...NAV_ICON_PROPS} /></span>
          ISA Truth
        </Link>
        <span className="shell-route">
          <ActiveIcon {...NAV_ICON_PROPS} />
          {activePage?.label ?? ACCOUNT_TITLES[pathname] ?? 'ISA Truth'}
        </span>
        <ThemePicker />
        <NavLink to={profile ? '/profile' : '/sign-in'} className="shell-account" aria-label={accountLabel}>
          <UserRound {...NAV_ICON_PROPS} />
          <span>{accountLabel}</span>
        </NavLink>
      </header>

      <dialog
        className="shell-drawer"
        ref={drawer}
        id="mobile-navigation-drawer"
        aria-labelledby="mobile-navigation-title"
        onClose={() => setMenuOpen(Boolean(drawer.current?.open))}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="shell-drawer-panel">
          <div className="shell-drawer-header">
            <h2 id="mobile-navigation-title">Navigation</h2>
            <button
              type="button"
              aria-label="Close navigation"
              className="shell-icon-action"
              onClick={() => drawer.current.close()}
            >
              <X {...NAV_ICON_PROPS} />
            </button>
          </div>
          <nav className="shell-drawer-links" aria-label="Main navigation">
            {DRAWER_LINKS.map((item) => (
              <NavigationLink
                key={item.to}
                item={item}
                className="shell-nav-link"
                onClick={() => drawer.current.close()}
              />
            ))}
          </nav>
        </div>
      </dialog>
    </>
  );
}
