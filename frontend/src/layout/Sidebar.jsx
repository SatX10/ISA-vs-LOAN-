import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Scale } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { ABOUT_LINK, NAV_ICON_PROPS, NAV_LINKS } from './navigation.js';
import NavigationLink from './NavigationLink.jsx';

const SIDEBAR_PREFERENCE = 'isa-truth-sidebar-collapsed';

function readSidebarPreference() {
  try {
    return localStorage.getItem(SIDEBAR_PREFERENCE) === 'true';
  } catch {
    return false;
  }
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(readSidebarPreference);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const collapseLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const AboutIcon = ABOUT_LINK.Icon;

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_PREFERENCE, String(collapsed));
    } catch {
      // The sidebar still toggles when storage is unavailable.
    }
  }, [collapsed]);

  return (
    <aside className="sidebar-desktop" data-collapsed={collapsed}>
      <div className="sidebar-brand-row">
        <Link to="/" className="shell-brand" title={collapsed ? 'ISA Truth' : undefined}>
          <span className="shell-brand-mark"><Scale {...NAV_ICON_PROPS} /></span>
          <span className="sidebar-label">ISA Truth</span>
        </Link>
      </div>

      <nav className="sidebar-links" id="desktop-navigation" aria-label="Main navigation">
        {NAV_LINKS.map((item) => (
          <NavigationLink
            key={item.to}
            item={item}
            title={collapsed ? item.label : undefined}
            className="shell-nav-link"
            labelClassName="sidebar-label"
          />
        ))}
        <NavLink to={ABOUT_LINK.to} className="shell-nav-link sidebar-about" title={collapsed ? ABOUT_LINK.label : undefined}>
          <AboutIcon {...NAV_ICON_PROPS} />
          <span className="sidebar-label">{ABOUT_LINK.label}</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="shell-nav-link sidebar-toggle"
          aria-expanded={!collapsed}
          aria-controls="desktop-navigation"
          title={collapsed ? collapseLabel : undefined}
          onClick={() => setCollapsed((value) => !value)}
        >
          <CollapseIcon {...NAV_ICON_PROPS} />
          <span className="sidebar-label">{collapseLabel}</span>
        </button>
      </div>
    </aside>
  );
}
