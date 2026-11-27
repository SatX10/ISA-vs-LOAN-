import { Link, useLocation } from 'react-router-dom';
import { matchesNavigation, NAV_ICON_PROPS } from './navigation.js';

export default function NavigationLink({ item, labelClassName, ...props }) {
  const { pathname } = useLocation();
  const { to, label, Icon } = item;

  return (
    <Link to={to} aria-current={matchesNavigation(item, pathname) ? 'page' : undefined} {...props}>
      <Icon {...NAV_ICON_PROPS} />
      <span className={labelClassName}>{label}</span>
    </Link>
  );
}
