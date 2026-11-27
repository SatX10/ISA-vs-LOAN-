import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { extractQuoteFile } from '../api/client.js';
import { deleteExpense, getLoanPayments, logLoanPayment } from '../api/plannerClient.js';
import { INR } from '../comparison.js';
import { CASES, newId, todayLocal } from '../offerWorkspace.js';
import { findQuoteTerms } from '../quoteTerms.js';
import { useStore } from '../state/store.js';
import { ActualPaymentsChart } from './OfferCharts.jsx';
import { RepaymentOptions } from './DecisionTools.jsx';

function QuoteReview() {
  const setParams = useStore((state) => state.setParams);
  const [params] = useSearchParams();
  const openFromLink = params.get('tool') === 'quote-review';
  const panel = useRef(null);
  const summary = useRef(null);
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [matches, setMatches] = useState(null);
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!openFromLink) return;
    panel.current.open = true;
    summary.current.focus();
  }, [openFromLink]);

  function setQuoteText(value) {
    setText(value);
    setMatches(null);
    setAccepted({});
    setApplied(false);
    setError('');
  }

  async function readFile() {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('The PDF must be 5 MB or smaller.');
      const data = await extractQuoteFile(file);
      setQuoteText(data.text);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function applyReviewedTerms() {
    setParams(Object.fromEntries(matches.filter(({ key, field }) => accepted[field] === key)
      .map(({ field, value }) => [field, value])));
    setApplied(true);
  }

  return (
    <details className="card workspace-tools no-print" ref={panel}>
      <summary ref={summary}>Import a quote or review contract terms</summary>
      <p>Paste the relevant terms or read a text-based PDF. Each suggested value includes the source line. Confirm every value before applying it.</p>
      <div className="workspace-form">
        <label className="workspace-field"><span>Quote PDF</span>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files[0] ?? null)} />
          <small>Up to 5 MB and 20 pages. The PDF is read by this app and discarded after extraction.</small>
        </label>
        <div><button type="button" className="btn btn-secondary" disabled={!file || busy} onClick={readFile}>{busy ? 'Reading PDF…' : 'Read PDF'}</button></div>
        {error && <p className="workspace-message" role="alert">{error}</p>}
        <label className="workspace-field"><span>Quote text</span>
          <textarea rows={6} value={text} maxLength={40_000} onChange={(event) => setQuoteText(event.target.value)} />
        </label>
        <div><button className="btn btn-secondary" type="button" disabled={!text.trim()} onClick={() => {
          setMatches(findQuoteTerms(text)); setAccepted({}); setApplied(false);
        }}>Find terms to review</button></div>
      </div>
      {matches?.length === 0 && <p className="workspace-message" role="status">No supported terms found. Enter the quote in Calculator manually.</p>}
      {matches?.length > 0 && (
        <>
          <ul className="quote-review">{matches.map(({ key, field, label, value, line }) => (
            <li key={key}>
              <label className="planner-ai-control"><input type="checkbox" checked={accepted[field] === key}
                onChange={(event) => { setAccepted({ ...accepted, [field]: event.target.checked ? key : null }); setApplied(false); }} />
                <span>{label} · {value}<small>{line}</small></span>
              </label>
            </li>
          ))}</ul>
          <button type="button" className="btn btn-primary" disabled={!Object.values(accepted).some(Boolean)}
            onClick={applyReviewedTerms}>Apply confirmed terms to Calculator</button>
          {applied && <p className="section-top" role="status">Terms applied. <Link to="/calculator">Review in Calculator</Link>.</p>}
        </>
      )}
      <p className="workspace-meta"><Link to="/contract-checker">Open the ISA clause checklist</Link> for terms that need manual review.</p>
    </details>
  );
}

function PaymentTracker({ offer, savedOffer, payments, onPayments, syncLedger, onStatement }) {
  const [month, setMonth] = useState(1);
  const [value, setValue] = useState('');
  const [date, setDate] = useState('');
  const [loaded, setLoaded] = useState([]);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const ledger = syncLedger && offer.kind === 'loan';
  useEffect(() => {
    if (!ledger || !open) return undefined;
    const controller = new AbortController();
    getLoanPayments(offer.id, controller.signal).then((items) => { if (!controller.signal.aborted) setLoaded(items); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [offer.id, ledger, open, refresh]);
  const entries = [...payments.filter(({ offerId }) => offerId === offer.id), ...(ledger ? loaded.map((entry) => ({ ...entry, ledger: true })) : [])];
  const actualByMonth = new Map();
  for (const entry of entries) actualByMonth.set(entry.month, (actualByMonth.get(entry.month) ?? 0) + entry.value);
  const lastLoggedMonth = Math.max(0, ...actualByMonth.keys());
  const totalLogged = entries.reduce((total, entry) => total + entry.value, 0);
  const projectedThroughLog = offer.monthly_payments_inr.slice(0, lastLoggedMonth).reduce((a, b) => a + b, 0);
  const rows = Array.from({ length: Math.max(offer.monthly_payments_inr.length, lastLoggedMonth) }, (_, index) => ({
    month: index + 1,
    planned: offer.monthly_payments_inr[index] ?? 0,
    actual: actualByMonth.get(index + 1) ?? null,
  }));
  const today = todayLocal();
  const dueRows = rows.filter(({ planned, actual }) => Math.round(planned * 100) > Math.round((actual ?? 0) * 100));
  const nextDue = dueRows.find((row) => offer.payment_dates?.[row.month - 1] >= today);
  const pastDue = dueRows.filter((row) => {
    const due = offer.payment_dates?.[row.month - 1];
    return due && due < today;
  });
  const scheduledBalance = offer.scheduled_balances_inr?.[lastLoggedMonth - 1];
  const [statementBalance, setStatementBalance] = useState(savedOffer.statement_balance_inr ?? '');
  const [statementDate, setStatementDate] = useState(savedOffer.statement_date || today);
  const [statementSaved, setStatementSaved] = useState(false);

  async function add(event) {
    event.preventDefault();
    setError(''); setWorking(true);
    try {
      if (ledger) {
        await logLoanPayment(offer.id, { description: `Loan payment · ${offer.label}`.slice(0, 100), amount_paise: Math.round(Number(value) * 100),
          spent_on: date, repayment_month: Number(month) });
        setRefresh((current) => current + 1);
      } else {
        onPayments([...payments, { id: newId(), offerId: offer.id, month: Number(month), value: Number(value), date }]);
      }
      setValue('');
    } catch (failure) { setError(failure.message); }
    finally { setWorking(false); }
  }

  async function remove(entry) {
    if (!window.confirm('Remove this logged payment?')) return;
    setError(''); setWorking(true);
    try {
      if (entry.ledger) { await deleteExpense(entry.id); setRefresh((current) => current + 1); }
      else onPayments(payments.filter(({ id }) => id !== entry.id));
    } catch (failure) { setError(failure.message); }
    finally { setWorking(false); }
  }

  return (
    <details className="card workspace-tools" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Track actual payments</summary>
      <p>Log regular payments for {offer.label}. Compare by repayment month. Keep cash paid at signing separate from this tracker.</p>
      {ledger && <p className="workspace-meta">New payments appear in your account spending ledger and in this tracker.</p>}
      {offer.kind === 'loan' && <dl className="financing-metrics">
        <div><dt>Next unpaid scheduled date</dt><dd>{nextDue ? `${offer.payment_dates[nextDue.month - 1]} · ${INR.format(nextDue.planned - (nextDue.actual ?? 0))}`
          : offer.payment_dates?.some(Boolean) ? 'No upcoming installment' : 'Add a funding date to the offer terms'}</dd></div>
        {pastDue.length > 0 && <div><dt>Past scheduled dates with a shortfall in the log</dt><dd>{pastDue.length}</dd></div>}
        {scheduledBalance != null && <div><dt>Scheduled remaining principal after month {lastLoggedMonth}</dt><dd>{INR.format(scheduledBalance)}</dd></div>}
        {savedOffer.statement_balance_inr != null && <div><dt>Statement balance on {savedOffer.statement_date}</dt><dd>{INR.format(savedOffer.statement_balance_inr)}</dd></div>}
      </dl>}
      {scheduledBalance != null && <p className="workspace-meta">The scheduled balance assumes the original payment plan. Use the balance on your lender statement for prepayment or refinancing.</p>}
      {offer.kind === 'loan' && <form className="workspace-form section-block" onSubmit={(event) => {
        event.preventDefault();
        onStatement({ statement_balance_inr: Number(statementBalance), statement_date: statementDate }); setStatementSaved(true);
      }}>
        <div className="planner-field-grid">
          <label className="workspace-field"><span>Lender statement balance (₹)</span>
            <input type="number" min="0" max="1000000000" step="0.01" required value={statementBalance} onChange={(event) => {
              setStatementBalance(event.target.value); setStatementSaved(false);
            }} /></label>
          <label className="workspace-field"><span>Statement date</span><input type="date" required max={today}
            value={statementDate} onChange={(event) => { setStatementDate(event.target.value); setStatementSaved(false); }} /></label>
        </div>
        <div><button className="btn btn-secondary" type="submit">Save statement balance</button></div>
        {statementSaved && <p role="status">Statement balance updated in this workspace.</p>}
      </form>}
      <form className="workspace-form no-print" onSubmit={add}>
        <div className="planner-field-grid">
          <label className="workspace-field"><span>Repayment month</span><input type="number" min={1} max={480} step={1}
            required value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label className="workspace-field"><span>Payment made (₹)</span><input type="number" min={0.01} max={ledger ? 10_000_000 : 1_000_000_000} step={0.01}
            required value={value} onChange={(event) => setValue(event.target.value)} /></label>
          <label className="workspace-field"><span>Payment date</span><input type="date" required={ledger} max={today}
            value={date} onChange={(event) => setDate(event.target.value)} /></label>
        </div>
        <div><button className="btn btn-primary" type="submit" disabled={working}>Log payment</button></div>
      </form>
      {error && <p className="workspace-message" role="alert">{error}</p>}
      {entries.length > 0 && (
        <>
          <p>Logged {INR.format(totalLogged)} against {INR.format(projectedThroughLog)} projected through month {lastLoggedMonth}.</p>
          <ActualPaymentsChart rows={rows} />
          <div className="table-scroll" role="region" aria-label="Logged repayments" tabIndex={0}><table className="data-table" aria-label="Logged repayment list">
            <thead><tr><th scope="col">Month</th><th scope="col">Date</th><th scope="col">Amount</th><th scope="col" className="no-print">Actions</th></tr></thead>
            <tbody>{entries.map((entry) => (
              <tr key={entry.id}><th scope="row">{entry.month}</th><td>{entry.date || '—'}</td><td>{INR.format(entry.value)}</td>
                <td className="no-print"><button type="button" className="btn btn-secondary" disabled={working}
                  onClick={() => remove(entry)}>Remove payment</button></td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}
      {offer.kind === 'loan' && <RepaymentOptions key={`repayment-${savedOffer.statement_balance_inr ?? ''}`}
        defaultBalance={savedOffer.statement_balance_inr ?? ''} defaultRate={savedOffer.inputs.loan_rate_pct}
        defaultMonths={lastLoggedMonth > (savedOffer.inputs.loan_grace ?? 0)
          ? Math.max(1, savedOffer.inputs.loan_term_months - (lastLoggedMonth - (savedOffer.inputs.loan_grace ?? 0)))
          : savedOffer.inputs.loan_term_months} defaultFee={savedOffer.inputs.loan_monthly_inr ?? 0} />}
    </details>
  );
}

function PaybackEstimate({ offer, fundingGoal }) {
  const [cost, setCost] = useState('');
  const [wages, setWages] = useState('');
  const [uplift, setUplift] = useState('');
  const [study, setStudy] = useState('');
  const [years, setYears] = useState('5');
  const [result, setResult] = useState(null);
  const charges = offer.cases.expected.total_inr - offer.funded_inr;
  return (
    <details className="card workspace-tools">
      <summary>Estimate education payback</summary>
      <p>Compare the course with your alternative path. Enter education costs after grants and the extra take-home pay you expect to earn after studying.</p>
      <form className="workspace-form" onSubmit={(event) => {
        event.preventDefault();
        const investment = Number(cost === '' ? fundingGoal : cost) + Number(wages) + charges;
        const months = Math.max(0, Math.round(Number(years) * 12) - Number(study));
        setResult({ investment, gain: months * Number(uplift) - investment, monthly: Number(uplift),
          payback: Number(uplift) > 0 ? Math.ceil(Math.max(0, investment) / Number(uplift)) : null });
      }}>
        <div className="planner-field-grid">
          {[
            ['Education costs after grants (₹)', cost === '' ? fundingGoal : cost, setCost, 0, 1_000_000_000],
            ['Income forgone while studying (₹)', wages, setWages, 0, 1_000_000_000],
            ['Extra take-home pay per month (₹)', uplift, setUplift, -1_000_000, 1_000_000],
            ['Months spent studying', study, setStudy, 0, 360],
            ['Years from the start of study', years, setYears, 1, 50],
          ].map(([label, value, setter, min, max]) => (
            <label key={label} className="workspace-field"><span>{label}</span>
              <input type="number" value={value} min={min} max={max} step="1" onChange={(event) => {
                setter(event.target.value); setResult(null);
              }} /></label>
          ))}
        </div>
        <div><button className="btn btn-secondary" type="submit">Estimate payback</button></div>
      </form>
      {result && <p role="status">Estimated investment {INR.format(result.investment)}. Net gain at the chosen horizon {INR.format(result.gain)}.{' '}
        {result.payback == null ? 'There is no payback estimate at this earnings uplift.' : `Estimated payback ${result.payback} months after study.`}</p>}
      <p className="workspace-meta">Uses {offer.label}’s expected financing charges. This simple estimate holds the earnings uplift steady and uses total costs.</p>
    </details>
  );
}

function ScenarioWeights({ offer }) {
  const [weights, setWeights] = useState({});
  const weighted = useMemo(() => Object.entries(offer.cases).reduce((result, [key, metrics]) => {
    const weight = Number(weights[key] ?? 0);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) return result;
    return {
      weight: result.weight + weight,
      total: result.total + weight * metrics.total_inr,
      over: result.over + (metrics.fits_budget === false ? weight : 0),
    };
  }, { weight: 0, total: 0, over: 0 }), [offer, weights]);
  return (
    <details className="card workspace-tools">
      <summary>Weight stress scenarios</summary>
      <p>Enter your own percentages for mutually exclusive outcomes. These weights are your assumptions. Use scenarios that total 100%.</p>
      <div className="planner-field-grid">
        {Object.keys(offer.cases).map((key) => (
          <label key={key} className="workspace-field"><span>{CASES[key]} (%)</span>
            <input type="number" min={0} max={100} step={0.1} value={weights[key] ?? ''}
              onChange={(event) => setWeights({ ...weights, [key]: event.target.value })} /></label>
        ))}
      </div>
      <p role="status">{Math.abs(weighted.weight - 100) < 1e-8
        ? `Weighted repayment ${INR.format(weighted.total / 100)}.${offer.cases.expected.fits_budget == null ? '' : ` Scenarios above the monthly budget account for ${weighted.over}% of the weight.`}`
        : `Current total weight ${Number(weighted.weight.toFixed(2))}%.`}</p>
    </details>
  );
}

export default function WorkspaceTools({ featured, savedOffer, syncLedger, payments, onPayments, onStatement, fundingGoal = 0 }) {
  return (
    <div className="offer-workspace">
      <QuoteReview />
      {featured && (
        <>
          <PaymentTracker key={featured.id} offer={featured} savedOffer={savedOffer} payments={payments} onPayments={onPayments}
            syncLedger={syncLedger} onStatement={onStatement} />
          <PaybackEstimate key={`roi-${featured.id}`} offer={featured} fundingGoal={fundingGoal} />
          <ScenarioWeights key={`weights-${featured.id}`} offer={featured} />
        </>
      )}
    </div>
  );
}
