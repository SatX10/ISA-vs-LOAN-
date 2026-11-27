import { ArrowUp, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../theme/footer.css';

const GROUPS = [
  ['Tools', [['Calculator', '/calculator'], ['Planning', '/planning'], ['Offer workspace', '/workspace']]],
  ['Resources', [['Loan rules and student aid', '/loan-rules'], ['Contract checker', '/contract-checker'], ['Methodology', '/methodology']]],
  ['ISA Truth', [['About', '/about'], ['Data and sharing', '/data-and-sharing']]],
];

export default function SiteFooter({ welcome = false }) {
  function backToTop() {
    const main = document.getElementById(welcome ? 'welcome-main' : 'main-content');
    main?.focus({ preventScroll: true });
    main?.scrollIntoView({ block: 'start' });
  }

  return <footer className={`site-footer no-print${welcome ? ' welcome-footer' : ''}`}>
    <div className="site-footer-content">
      <div className="site-footer-brand">
        <Link to="/" className="shell-brand"><Scale size={21} strokeWidth={1.75} aria-hidden="true" />ISA Truth</Link>
        <p>Compare education funding and understand what you might repay.</p>
      </div>
      <nav aria-label="Footer navigation" className="site-footer-links">
        {GROUPS.map(([title, links]) => <div key={title}>
          <h2>{title}</h2>
          <ul>{links.map(([label, path]) => <li key={path}><Link to={path}>{label}</Link></li>)}</ul>
        </div>)}
      </nav>
    </div>
    <div className="site-footer-bottom">
      <small>© {new Date().getFullYear()} ISA Truth</small>
      <button type="button" onClick={backToTop}>Back to top <ArrowUp size={16} aria-hidden="true" /></button>
    </div>
  </footer>;
}
