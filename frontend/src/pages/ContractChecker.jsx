import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const CLAUSES = [
  { id: 'cap', title: 'No explicit total repayment cap', detail: 'Look for the maximum amount you can owe over the life of the agreement.',
    question: 'What is the maximum I can repay under this agreement, and which fees count toward that cap?' },
  { id: 'trigger', title: 'Payments start at a low income', detail: 'Check the income level that triggers payments and whether the agreement uses gross or take-home pay.',
    question: 'What income threshold triggers payments, which earnings count, and how often is the threshold assessed?' },
  { id: 'term', title: 'The payment window lasts several years', detail: 'Check when the window starts and whether months without payments count toward it.',
    question: 'When does the payment window start and end, and do months with no payment extend it?' },
  { id: 'unemployment', title: 'A fee is owed while unemployed', detail: 'Look for minimum payments, fixed charges, or repayment obligations during unemployment.',
    question: 'What payments or fees are due if I lose my job, and how do I report a period without income?' },
  { id: 'grace', title: 'There is no grace period for finding a job', detail: 'Check the date when payments can first become due.',
    question: 'When can the first payment become due, and what happens if I have not found a job by then?' },
];

function downloadQuestions(clauses) {
  const content = ['ISA Truth contract review', '', 'Questions for your ISA provider', '',
    ...clauses.map(({ question }, index) => `${index + 1}. ${question}`), '',
    'Record the answers in writing before comparing the confirmed terms.'].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const download = document.createElement('a');
  download.href = url;
  download.download = 'isa-contract-review.txt';
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContractChecker() {
  const [checked, setChecked] = useState({});
  const [reviewed, setReviewed] = useState(false);
  const resultHeading = useRef(null);
  const marked = CLAUSES.filter(({ id }) => checked[id]);

  useEffect(() => {
    if (reviewed) resultHeading.current?.focus();
  }, [reviewed]);

  return (
    <div>
      <header className="page-header">
        <h1>Contract Checker</h1>
        <p>Find the ISA terms you need to clarify before comparing what you could owe.</p>
      </header>
      <section className="card reading-width section-block" aria-labelledby="contract-clauses">
        <h2 id="contract-clauses" className="section-title">Clauses to review</h2>
        <p className="section-block">Mark a clause if it applies to your agreement or you need the provider to clarify it.</p>
        <fieldset className="clause-list planner-fieldset" aria-labelledby="contract-clauses">
          {CLAUSES.map(({ id, title, detail }) => (
            <label className="clause" key={id}>
              <input type="checkbox" checked={Boolean(checked[id])}
                onChange={(event) => {
                  setChecked({ ...checked, [id]: event.target.checked });
                  setReviewed(false);
                }} />
              <span><strong>{title}</strong><span className="clause-detail">{detail}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="section-top" role="status">{marked.length} of {CLAUSES.length} clauses marked for follow-up.</p>
        <button type="button" className="btn btn-primary section-top" onClick={() => {
          if (reviewed) resultHeading.current?.focus();
          else setReviewed(true);
        }}>Review my findings</button>
      </section>
      {reviewed && <section className="card reading-width" aria-labelledby="contract-review-summary">
        <h2 id="contract-review-summary" className="section-title" ref={resultHeading} tabIndex={-1}>Review summary</h2>
        {marked.length ? (
          <>
            <p>Ask your provider to confirm these terms in writing.</p>
            <ol className="contract-questions section-top">{marked.map(({ id, title, question }) => (
              <li key={id}><h3>{title}</h3><p>{question}</p></li>
            ))}</ol>
          </>
        ) : <p>No clauses marked for follow-up. Use the amounts and dates in your written agreement when comparing repayment.</p>}
        <div className="button-row section-top">
          {marked.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => downloadQuestions(marked)}>Download questions</button>}
          <Link className="btn btn-secondary" to="/workspace?tool=quote-review">Review a written quote</Link>
          <Link className="btn btn-primary" to="/calculator">Compare confirmed terms</Link>
        </div>
      </section>}
    </div>
  );
}
