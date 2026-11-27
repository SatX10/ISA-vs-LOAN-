import { Outlet, useLocation } from 'react-router-dom';
import NavigationLink from './NavigationLink.jsx';
import { matchesNavigation, PLANNING_TABS } from './navigation.js';
import '../theme/planning.css';

export default function PlanningLayout() {
  const { pathname, state } = useLocation();
  const dreamState = state?.dreamReview ? { dreamReview: state.dreamReview } : undefined;

  return (
    <>
      <nav className="planning-tabs" aria-label="Planning tools">
        {PLANNING_TABS.map((item) => (
          <NavigationLink key={item.to} item={item} className="planning-tab"
            state={item.to === '/planning' ? dreamState : undefined}
            onClick={(event) => {
              if (matchesNavigation(item, pathname) && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
              }
            }} />
        ))}
      </nav>
      <Outlet />
    </>
  );
}
