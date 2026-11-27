import {
  BookOpen, Calculator, ChartColumn, Compass, Crosshair, Download, Files, GraduationCap, Grid2X2, Info, Landmark, ListChecks, Sparkles,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';

export const ABOUT_LINK = { to: '/about', label: 'About', Icon: Info };

export const PLANNING_TABS = [
  { to: '/planning', label: 'Dream Path', Icon: GraduationCap, aliases: ['/dream-path'] },
  { to: '/planner', label: 'AI Planner', Icon: Sparkles },
];

export const NAV_LINKS = [
  { to: '/calculator', label: 'Calculator', Icon: Calculator },
  { to: '/planning', label: 'Planning', Icon: Compass, aliases: ['/dream-path', '/planner'] },
  { to: '/scenarios', label: 'Scenarios', Icon: ChartColumn },
  { to: '/sensitivity', label: 'Sensitivity', Icon: Grid2X2 },
  { to: '/loan-rules', label: 'Loan rules', Icon: Landmark },
  { to: '/workspace', label: 'Offer workspace', Icon: Files },
  { to: '/break-even', label: 'Break-even', Icon: Crosshair },
  { to: '/saved', label: 'Compare contracts', Icon: Files },
  { to: '/contract-checker', label: 'Contract checker', Icon: ListChecks },
  { to: '/methodology', label: 'Methodology', Icon: BookOpen },
  { to: '/export', label: 'Export', Icon: Download },
];

export function matchesNavigation(link, pathname) {
  return Boolean(matchPath(link.to, pathname) || link.aliases?.some((path) => matchPath(path, pathname)));
}

export const NAV_ICON_PROPS = {
  size: 20,
  strokeWidth: 1.75,
  'aria-hidden': true,
};
