import { useState } from 'react';

const CLAUSES = [
  { id: 'cap', title: 'No explicit total repayment cap', detail: 'Look for the maximum amount you can owe over the life of the agreement.' },
  { id: 'trigger', title: 'Payments start at a low income', detail: 'Check the income level that triggers payments and whether the agreement uses gross or take-home pay.' },
  { id: 'term', title: 'The payment window lasts several years', detail: 'Check when the window starts and whether months without payments count toward it.' },
  { id: 'unemployment', title: 'A fee is owed while unemployed', detail: 'Look for minimum payments, fixed charges, or repayment obligations during unemployment.' },
  { id: 'grace', title: 'There is no grace period for finding a job', detail: 'Check the date when payments can first become due.' },
];

export default function ContractChecker() {
  const [checked, setChecked] = useState({});
  const count = Object.values(checked).filter(Boolean).length;

  return (
    <div>
      <header className="page-header">
        <h1>Contract Checker</h1>
        <p>Mark the clauses you find in your ISA and review the terms that affect what you could owe.</p>
      </header>
      <section className="card reading-width">
        <h2 className="section-title">Clauses to review</h2>
        <div className="clause-list">
          {CLAUSES.map(({ id, title, detail }) => (
            <label className="clause" key={id}>
              <input type="checkbox" checked={Boolean(checked[id])}
                onChange={(event) => setChecked({ ...checked, [id]: event.target.checked })} />
              <span><strong>{title}</strong><span className="clause-detail">{detail}</span></span>
            </label>
          ))}
        </div>
        <p className="section-top" role="status">{count} of {CLAUSES.length} clauses marked for review.</p>
      </section>
    </div>
  );
}
