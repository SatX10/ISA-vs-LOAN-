import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Coffee, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { NAV_ICON_PROPS } from './navigation.js';

const MODES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'coffee', label: 'Coffee', Icon: Coffee },
];

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const options = useRef([]);
  const initialIndex = useRef(0);
  const selectedIndex = MODES.findIndex(({ value }) => value === theme);
  const { label, Icon: CurrentIcon } = MODES[selectedIndex];

  useLayoutEffect(() => {
    if (open) options.current[initialIndex.current]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnPointerDown(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnPointerDown);
    return () => document.removeEventListener('pointerdown', closeOnPointerDown);
  }, [open]);

  function openMenu(index) {
    initialIndex.current = index;
    setOpen(true);
  }

  function closeMenu() {
    trigger.current?.focus();
    setOpen(false);
  }

  function handleMenuKey(event) {
    const index = options.current.indexOf(document.activeElement);
    let nextIndex;
    switch (event.key) {
      case 'ArrowDown': nextIndex = (index + 1) % MODES.length; break;
      case 'ArrowUp': nextIndex = (index + MODES.length - 1) % MODES.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = MODES.length - 1; break;
      case 'Escape':
        event.preventDefault();
        closeMenu();
        return;
      case 'Tab':
        closeMenu();
        return;
      default: return;
    }
    event.preventDefault();
    options.current[nextIndex]?.focus();
  }

  return (
    <div ref={root} className="theme-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        ref={trigger}
        type="button"
        className="theme-picker-trigger"
        aria-label={`Color theme: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          if (open) setOpen(false);
          else openMenu(event.detail === 0 ? 0 : selectedIndex);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu(event.key === 'ArrowDown' ? 0 : MODES.length - 1);
          }
        }}
      >
        <CurrentIcon {...NAV_ICON_PROPS} size={18} />
        <span className="theme-picker-label" aria-hidden="true">{label}</span>
        <ChevronDown {...NAV_ICON_PROPS} size={16} className="theme-picker-chevron" />
      </button>

      {open && (
        <div id={menuId} className="theme-picker-menu" role="menu" aria-label="Color theme" onKeyDown={handleMenuKey}>
          {MODES.map(({ value, label: modeLabel, Icon }, index) => (
            <button
              key={value}
              ref={(element) => { options.current[index] = element; }}
              type="button"
              className="theme-picker-option"
              data-mode={value}
              role="menuitemradio"
              aria-checked={value === theme}
              tabIndex={-1}
              onClick={() => {
                setTheme(value);
                closeMenu();
              }}
            >
              <Icon {...NAV_ICON_PROPS} size={17} />
              <span>{modeLabel}</span>
              {value === theme ? <Check {...NAV_ICON_PROPS} size={15} /> : <span className="theme-picker-swatch" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
