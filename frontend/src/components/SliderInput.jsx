import { useId, useState } from 'react';

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  numberInput: {
    width: '72px',
    padding: '0.2rem 0.4rem',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text-primary)',
    fontSize: '0.85rem',
    textAlign: 'right',
  },
  range: {
    width: '100%',
    accentColor: 'var(--color-accent)',
    cursor: 'pointer',
  },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.72rem',
    color: 'var(--color-text-muted)',
  },
};

/**
 * SliderInput — a labelled range slider synced with a numeric text input.
 *
 * Props:
 *   label        string   Display label
 *   value        number   Current value
 *   onChange     fn(val)  Called with numeric value on change
 *   min          number
 *   max          number
 *   step         number   (default 1)
 *   unit         string   Optional unit suffix (e.g. '%', '₹', 'LPA')
 *   decimals     number   Decimal places for display (default 0)
 */
export default function SliderInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  decimals = 0,
}) {
  const id = useId();
  const [draft, setDraft] = useState(null);

  const format = (v) =>
    unit ? `${Number(v).toFixed(decimals)}${unit}` : Number(v).toFixed(decimals);

  const handleSlider = (e) => {
    setDraft(null);
    onChange(e.target.valueAsNumber);
  };

  const handleNumber = (e) => {
    const { value: text, valueAsNumber, validity } = e.target;
    setDraft(text);
    if (validity.valid && Number.isFinite(valueAsNumber)) onChange(valueAsNumber);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.row}>
        <label htmlFor={id} style={styles.label}>
          {label}
        </label>
        <input
          type="number"
          value={draft ?? value}
          min={min}
          max={max}
          step={decimals === 0 ? 1 : 'any'}
          onChange={handleNumber}
          onBlur={() => setDraft(null)}
          style={styles.numberInput}
          aria-label={`${label} numeric input`}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSlider}
        style={styles.range}
        aria-label={label}
      />
      <div style={styles.meta}>
        <span>{format(min)}</span>
        <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{format(value)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
