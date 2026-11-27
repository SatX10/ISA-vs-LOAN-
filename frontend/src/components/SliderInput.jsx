import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { INR } from '../comparison.js';

export default function SliderInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  decimals = 0,
  help,
  error,
}) {
  const id = useId();
  const rangeId = `${id}-range`;
  const numberId = `${id}-number`;
  const messageId = `${id}-message`;
  const [draft, setDraft] = useState(null);
  const [invalidDraft, setInvalidDraft] = useState(false);

  const format = (amount) => unit.trim() === '₹'
    ? INR.format(amount)
    : `${amount.toFixed(decimals)}${unit}`;
  const snapped = Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step));
  const progress = max > min ? (snapped - min) / (max - min) * 100 : 0;
  const message = error || (invalidDraft ? `Enter ${decimals ? 'a number' : 'a whole number'} from ${format(min)} to ${format(max)}.` : '');

  function clearDraft() {
    setDraft(null);
    setInvalidDraft(false);
  }

  return (
    <div className="slider-field">
      <div className="slider-heading">
        <div className="slider-title">
          <label htmlFor={rangeId}>{label}</label>
          {help && (
            <details className="slider-help" onKeyDown={(event) => {
              if (event.key === 'Escape' && event.currentTarget.open) {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary').focus();
              }
            }}>
              <summary aria-label={`About ${label}`}>
                <Info size={16} strokeWidth={1.75} aria-hidden="true" />
              </summary>
              <p className="jargon-tooltip">{help}</p>
            </details>
          )}
        </div>
        <input
          id={numberId}
          className="slider-number numeric"
          type="number"
          value={draft ?? value}
          min={min}
          max={max}
          step={decimals === 0 ? 1 : 'any'}
          required
          aria-label={`${label} numeric input`}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(event) => {
            const { value: text, valueAsNumber, validity } = event.target;
            const valid = validity.valid && Number.isFinite(valueAsNumber);
            setDraft(text);
            setInvalidDraft(!valid && (text !== '' || validity.badInput));
            if (valid) onChange(valueAsNumber);
          }}
          onBlur={(event) => {
            if (event.currentTarget.validity.valid) clearDraft();
            else setInvalidDraft(true);
          }}
          onInvalid={() => setInvalidDraft(true)}
        />
      </div>
      <input
        id={rangeId}
        className="slider-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--slider-progress': `${progress}%` }}
        aria-valuetext={format(snapped)}
        aria-describedby={message ? messageId : undefined}
        onChange={(event) => {
          clearDraft();
          onChange(event.target.valueAsNumber);
        }}
      />
      <div className="slider-readouts numeric" aria-hidden="true">
        <span>{format(min)}</span>
        <strong>{format(value)}</strong>
        <span>{format(max)}</span>
      </div>
      <div className="slider-message" aria-live="polite">
        {message && <p id={messageId}>{message}</p>}
      </div>
    </div>
  );
}
