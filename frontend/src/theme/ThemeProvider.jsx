import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'isa-truth-theme';
const VALID_THEMES = ['light', 'dark', 'coffee'];
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

function getSavedTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_THEMES.includes(stored)) return stored;
  } catch (_) { /* storage unavailable */ }

  return null;
}

export function ThemeProvider({ children }) {
  const [preference, setTheme] = useState(getSavedTheme);
  const [systemTheme, setSystemTheme] = useState(
    () => window.matchMedia?.(DARK_MODE_QUERY).matches ? 'dark' : 'light',
  );
  const theme = preference ?? systemTheme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!preference) return;
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (_) { /* storage unavailable */ }
  }, [preference]);

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_MODE_QUERY);
    if (!mq) return;
    const handler = (event) => setSystemTheme(event.matches ? 'dark' : 'light');
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = () =>
    setTheme((prev) => VALID_THEMES[(VALID_THEMES.indexOf(prev ?? systemTheme) + 1) % VALID_THEMES.length]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
