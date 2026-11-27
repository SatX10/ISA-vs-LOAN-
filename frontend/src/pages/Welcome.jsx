import { useEffect, useRef } from 'react';
import { Scale } from 'lucide-react';
import darkObjects from '../assets/welcome-objects-dark.webp';
import lightObjects from '../assets/welcome-objects-light.webp';
import ThemePicker from '../layout/ThemePicker.jsx';
import SiteFooter from '../layout/SiteFooter.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import '../theme/welcome.css';

export default function Welcome({ leaving, onEnter, onFinish }) {
  const { theme } = useTheme();
  const touchOrigin = useRef(null);

  useEffect(() => {
    if (leaving) return;
    function handleKey(event) {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest('button, a, input, textarea, [contenteditable]')) return;
      event.preventDefault();
      onEnter();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [leaving, onEnter]);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(onFinish, 800);
    return () => window.clearTimeout(timeout);
  }, [leaving, onFinish]);

  function readSwipe(event) {
    const start = touchOrigin.current;
    touchOrigin.current = null;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const rise = start.y - end.clientY;
    if (rise >= 55 && rise > Math.abs(start.x - end.clientX) * 1.3) onEnter();
  }

  return (
    <div
      className="welcome-screen"
      data-leaving={leaving}
      onAnimationEnd={(event) => { if (leaving && event.target === event.currentTarget) onFinish(); }}
    >
      <main id="welcome-main" className="welcome-layout" tabIndex={-1} aria-labelledby="welcome-title">
        <header className="welcome-header" inert={leaving ? '' : undefined}>
          <div className="welcome-brand">
            <span className="welcome-mark"><Scale size={22} strokeWidth={1.75} aria-hidden="true" /></span>
            ISA Truth
          </div>
          <ThemePicker />
        </header>
        <div className="welcome-hero">
          <section className="welcome-copy">
            <h1 id="welcome-title">Know what your <em>education will cost.</em></h1>
            <p>Compare an income share agreement with an education loan. See what you’d repay as your salary changes, and find a plan that fits your budget.</p>
            <div className="welcome-actions">
              <button type="button" className="welcome-enter" onClick={onEnter} disabled={leaving}>
                Open calculator
              </button>
              <span className="welcome-key-hint">Press <kbd>Space</kbd> to enter</span>
            </div>
          </section>
          <div
            className="welcome-scene"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              touchOrigin.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
            }}
            onTouchCancel={() => { touchOrigin.current = null; }}
            onTouchEnd={readSwipe}
          >
            <img
              src={theme === 'dark' ? darkObjects : lightObjects}
              width="1448"
              height="1086"
              alt="A graduation cap, calculator, and budget worksheet"
              fetchPriority="high"
            />
          </div>
        </div>
      </main>
      <SiteFooter welcome />
    </div>
  );
}
