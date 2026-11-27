import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ADVANCED_TERMS, parseMonthlySchedule } from '../advancedTerms.js';

function ScheduleField({ field, value, onChange }) {
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState('');

  return (
    <label className="workspace-field">
      <span>{field.label}</span>
      <textarea value={draft} rows={3} spellCheck={false} onChange={(event) => {
        const input = event.target;
        setDraft(input.value);
        try {
          parseMonthlySchedule(input.value, field.maxMonth, field.maxValue);
          input.setCustomValidity('');
          setError('');
          onChange(input.value);
        } catch (invalid) {
          input.setCustomValidity(invalid.message);
          setError(invalid.message);
        }
      }} />
      <small>{error || field.hint}</small>
    </label>
  );
}

export default function AdvancedTerms({ inputs, onChange }) {
  return (
    <details className="calculator-term-group advanced-terms">
      <summary>Advanced terms and budget <ChevronDown size={18} aria-hidden="true" /></summary>
      {ADVANCED_TERMS.map(({ title, fields }) => (
        <fieldset key={title} className="advanced-fields">
          <legend>{title}</legend>
          {fields.filter(({ when }) => !when || Object.entries(when).every(([key, value]) => inputs[key] === value))
            .map((field) => {
              const { id, label, options, min = 0, max = 1_000_000_000, step = 'any', fallback = '', hint } = field;
              if (field.schedule) return <ScheduleField key={id} field={field} value={inputs[id]} onChange={(value) => onChange(id, value)} />;
              return (
                <label key={id} className="workspace-field">
                  <span>{label}</span>
                  {options ? (
                    <select value={inputs[id] ?? Object.keys(options)[0]} onChange={(event) => onChange(id, event.target.value)}>
                      {Object.entries(options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </select>
                  ) : field.date ? (
                    <input type="date" min="1900-01-01" max="2200-12-31" value={inputs[id] ?? ''}
                      onChange={(event) => onChange(id, event.target.value)} />
                  ) : (
                    <input type="number" min={min} max={max} step={step}
                      value={inputs[id] ?? fallback} onChange={(event) => {
                        const input = event.target;
                        if (input.validity.valid) onChange(id, input.value === '' ? undefined : input.valueAsNumber);
                      }} />
                  )}
                  {hint && <small>{hint}</small>}
                </label>
              );
            })}
        </fieldset>
      ))}
    </details>
  );
}
