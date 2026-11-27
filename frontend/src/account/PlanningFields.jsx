const OPTIONS = [
  ['total_cost', 'Lowest total repayment'],
  ['monthly_cost', 'Lowest peak monthly payment'],
  ['income_flexibility', 'Flexibility at a lower income'],
];

export function PriorityField({ value, onChange }) {
  return (
    <label className="workspace-field">
      <span>Repayment priority</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}

export function BudgetField({ value, onChange, optional = false, max = 10_000_000, step = 1 }) {
  return (
    <label className="workspace-field">
      <span>Monthly repayment budget (₹){optional && ' · optional'}</span>
      <input
        className="numeric"
        type="number"
        inputMode={step === 1 ? 'numeric' : 'decimal'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min="0"
        max={max}
        step={step}
        placeholder="e.g. 12000"
        required={!optional}
      />
    </label>
  );
}
