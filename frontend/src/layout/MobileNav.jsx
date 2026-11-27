import NavigationLink from './NavigationLink.jsx';
import { NAV_LINKS } from './navigation.js';

const PRIMARY_LINKS = NAV_LINKS.slice(0, 4);

export default function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Bottom navigation">
      {PRIMARY_LINKS.map((item) => (
        <NavigationLink key={item.to} item={item} className="mobile-nav-link" />
      ))}
    </nav>
  );
}
