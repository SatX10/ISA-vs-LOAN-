import { useState } from 'react';
import { INR } from '../comparison.js';
import { CASES, newId, todayLocal } from '../offerWorkspace.js';

export function ReportAssumptions({ assumptions = {} }) {
  const { salary_lpa: salary, budget_inr: budget, delay_months: delay, rate_increase_percent: rate, fx_increase_percent: fx } = assumptions ?? {};
  const rows = [
    ['Starting gross salary', salary == null ? null : `${salary} LPA`],
    ['Monthly repayment budget', budget == null ? null : INR.format(budget)],
    ['Extra job delay', delay == null ? null : `${delay} months`],
    ['Loan rate increase', rate == null ? null : `${rate} percentage points`],
    ['Foreign repayment cost increase', fx == null ? null : `${fx}%`],
  ].filter(([, value]) => value != null);
  return rows.length > 0 && <dl className="financing-metrics section-top" aria-label="Comparison assumptions">
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

export default function SavedComparisons({ comparisons, current, onChange, Table, onPrint }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const comparison = comparisons.find(({ id }) => id === selected);
  const canAdd = comparisons.length < 20;

  function save(event) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return;
    if (editing) {
      onChange(comparisons.map((item) => item.id === editing ? { ...item, label } : item));
    } else if (current && canAdd) {
      const created = { id: newId(), label, created_at: todayLocal(), snapshot: current };
      onChange([...comparisons, created]);
      setSelected(created.id);
    }
    setEditing(null);
    setName('');
    setMessage(editing ? 'Comparison renamed.' : 'Comparison saved.');
  }

  return (
    <section className="card no-print" aria-labelledby="saved-comparisons-heading">
      <h2 id="saved-comparisons-heading" className="section-title">Saved comparisons</h2>
      {(current && canAdd || editing) && <form className="workspace-form section-block" onSubmit={save}>
        <label className="workspace-field"><span>Comparison name</span><input maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="button-row"><button type="submit" className="btn btn-primary">{editing ? 'Rename comparison' : 'Save comparison'}</button>
          {editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setName(''); }}>Cancel rename</button>}</div>
      </form>}
      {!current && !comparisons.length && <p>Run a comparison to save its assumptions and results here.</p>}
      {!canAdd && <p>Remove a saved comparison to free a slot.</p>}
      {comparisons.length > 0 && <label className="workspace-field"><span>Open a saved comparison</span>
        <select value={selected ?? ''} onChange={(event) => { setSelected(event.target.value || null); setEditing(null); setName(''); }}>
          <option value="">Choose a comparison</option>
          {comparisons.map(({ id, label, created_at: created }) => <option key={id} value={id}>{label} · {created}</option>)}
        </select></label>}
      {comparison && <div className="section-top">
        <h3>{comparison.label}</h3>
        <p>{CASES[comparison.snapshot.scenario]} · Saved {comparison.created_at}</p>
        <Table rows={comparison.snapshot.rows} />
        <ReportAssumptions assumptions={comparison.snapshot.assumptions} />
        <div className="button-row section-top">
          <button type="button" className="btn btn-secondary" onClick={() => onPrint(comparison.snapshot, comparison.label)}>Print redacted report</button>
          <button type="button" className="btn btn-secondary" onClick={() => { setEditing(comparison.id); setName(comparison.label); }}>Edit name</button>
          <button type="button" className="btn btn-secondary" disabled={!canAdd} onClick={() => {
            const copy = { ...comparison, id: newId(), label: `${comparison.label.slice(0, 112)} (copy)`, created_at: todayLocal() };
            onChange([...comparisons, copy]); setSelected(copy.id); setMessage('Comparison duplicated.');
          }}>Duplicate comparison</button>
          <button type="button" className="btn btn-secondary" onClick={() => {
            if (!window.confirm(`Remove ${comparison.label}?`)) return;
            onChange(comparisons.filter(({ id }) => id !== comparison.id)); setSelected(null); setEditing(null); setName('');
          }}>Remove comparison</button>
        </div>
      </div>}
      {message && <p role="status" className="workspace-meta">{message}</p>}
    </section>
  );
}
