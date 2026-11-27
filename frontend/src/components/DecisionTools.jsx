import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '../account/AccountProvider.jsx';
import { runDecisionTool } from '../api/client.js';
import { getPlannerCapabilities } from '../api/plannerClient.js';
import { comparisonRequest, INR } from '../comparison.js';
import { downloadWorkspaceCsv, portfolioOffer } from '../offerWorkspace.js';
import { useStore } from '../state/store.js';

function NumberField({ label, value, onChange, min = 0, max = 1_000_000_000, step = 'any', required = false }) {
  return <label className="workspace-field"><span>{label}</span><input type="number" min={min} max={max} step={step}
    value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function useDecision(tool) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(null);
  const clear = useCallback(() => {
    active.current?.abort(); active.current = null;
    setData(null); setError(''); setBusy(false);
  }, []);
  useEffect(() => () => active.current?.abort(), []);
  async function run(payload) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(''); setData(null);
    try {
      const result = await runDecisionTool(tool, payload, controller.signal);
      if (!controller.signal.aborted) setData(result);
    }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return { data, busy, error, run, clear };
}

const TERM_LABELS = {
  income_share: 'Income share', cap: 'Repayment cap', rate: 'Starting loan rate', upfront_fee: 'Upfront fee',
  monthly_fee: 'Recurring monthly fee', financed_cost: 'Financed fee', withheld_fee: 'Withheld fee',
};

export function NegotiationTools({ offer, benchmark, salary }) {
  const { data, busy, error, run } = useDecision('negotiate');
  return <details className="card workspace-tools no-print">
    <summary>Find negotiation targets</summary>
    {benchmark ? <p>Compare with {benchmark.label} at the same net funding. The target is {INR.format(benchmark.cases.expected.total_inr)} under the expected scenario.</p>
      : <p>Save a second offer with the same net funding to calculate matching terms.</p>}
    {benchmark && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run({
      offer: portfolioOffer(offer), salary_lpa: Number(salary), target_inr: benchmark.cases.expected.total_inr,
    })}>{busy ? 'Testing terms…' : 'Calculate negotiation targets'}</button>}
    {error && <p role="alert" className="workspace-message">{error}</p>}
    {data && <div className="section-top" aria-live="polite">
      <p>Current projected repayment {INR.format(data.original_total_inr)} against the target of {INR.format(data.target_inr)}.</p>
      {!data.options.length && <p>This offer already meets the repayment target.</p>}
      {data.options.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label="Negotiated term targets"><table className="data-table">
        <thead><tr><th scope="col">Change one term</th><th scope="col">Target to request</th><th scope="col">Projected repayment</th></tr></thead>
        <tbody>{data.options.map(({ term, match, waiver_inr: waiver, full_waiver_total_inr: full }) => <tr key={term}>
          <th scope="row">{TERM_LABELS[term]}</th><td>{match ? waiver != null ? `Waive at least ${INR.format(waiver)}`
            : term === 'cap' ? `At most ${match.value.toFixed(2)}×` : `At most ${(match.value * (term === 'rate' ? 100 : 1)).toFixed(2)}%`
            : 'This change alone cannot match the target'}</td><td>{match ? INR.format(match.total_inr) : full == null ? '—' : `${INR.format(full)} after full waiver`}</td>
        </tr>)}</tbody>
      </table></div>}
      <p className="workspace-meta">Each row holds the other terms fixed. A rate change shifts existing resets by the same reduction, with a floor of zero.</p>
      <h4>Questions for the provider</h4><ul>{data.questions.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}
  </details>;
}

export function RepaymentOptions({ defaultBalance, defaultRate, defaultMonths, defaultFee }) {
  const { data, busy, error, run, clear } = useDecision('repayment');
  const [values, setValues] = useState(() => ({ balance: defaultBalance, rate: defaultRate, months: defaultMonths, fee: defaultFee,
    prepay: '', prepayFee: '', refinanceRate: '', refinanceMonths: '', refinanceFee: '', exitFee: '' }));
  function setValue(key, value) { setValues({ ...values, [key]: value }); clear(); }
  return <details className="card workspace-tools no-print">
    <summary>Compare prepayment and refinancing</summary>
    <p>Enter your current lender statement balance. The keep and prepayment scenarios assume a fixed rate and spread the balance over the same remaining term. Refinancing replaces it with a new fixed-rate loan.</p>
    <form className="workspace-form" onSubmit={(event) => {
      event.preventDefault();
      run({ balance_inr: Number(values.balance), rate: Number(values.rate) / 100, months: Number(values.months), monthly_fee_inr: Number(values.fee),
        prepayment_inr: Number(values.prepay), prepayment_fee_inr: Number(values.prepayFee),
        refinance_rate: values.refinanceRate === '' ? null : Number(values.refinanceRate) / 100,
        refinance_months: values.refinanceMonths === '' ? null : Number(values.refinanceMonths),
        refinance_fee_inr: Number(values.refinanceFee), exit_fee_inr: Number(values.exitFee) });
    }}>
      <fieldset className="planner-fieldset planner-field-grid" disabled={busy} aria-label="Repayment assumptions">
        {[
          ['balance', 'Remaining balance on statement (₹)', 0, 1_000_000_000, 0.01, true], ['rate', 'Current annual rate (%)', 0, 60, 0.01, true],
          ['months', 'Remaining installments', 1, 360, 1, true], ['fee', 'Current monthly fee (₹)'],
          ['prepay', 'One-time prepayment (₹)'], ['prepayFee', 'Prepayment fee (₹)'],
          ['refinanceRate', 'New annual rate (%)', 0, 60, 0.01], ['refinanceMonths', 'New term in months', 1, 360, 1],
          ['refinanceFee', 'New loan fees paid upfront (₹)'], ['exitFee', 'Existing loan exit fee (₹)'],
        ].map(([key, label, min, max, step, required]) => <NumberField key={key} label={label} min={min} max={max} step={step}
          required={required} value={values[key]} onChange={(value) => setValue(key, value)} />)}
      </fieldset>
      <div><button type="submit" className="btn btn-secondary" disabled={busy}>{busy ? 'Calculating…' : 'Compare repayment options'}</button></div>
    </form>
    {error && <p role="alert" className="workspace-message">{error}</p>}
    {data && <div className="table-scroll section-top" role="region" tabIndex={0} aria-label="Repayment options table"><table className="data-table">
      <thead><tr><th scope="col">Option</th><th scope="col">First monthly payment</th><th scope="col">Total future cash paid</th><th scope="col">Change from keeping the loan</th></tr></thead>
      <tbody>{Object.entries(data).filter(([, result]) => result).map(([key, result]) => <tr key={key}>
        <th scope="row">{{ keep: 'Keep loan', prepay: 'Prepay and recast', refinance: 'Refinance' }[key]}</th>
        <td>{INR.format(result.first_month_inr)}</td><td>{INR.format(result.total_inr)}</td><td>{INR.format(result.total_inr - data.keep.total_inr)}</td>
      </tr>)}</tbody>
    </table></div>}
  </details>;
}

const RISK_COLS = [
  ['salary_lpa', 'Salary (LPA)'], ['rate_increase', 'Rate increase (decimal)'], ['fx_increase', 'FX increase (decimal)'],
  ['isa_total_inr', 'ISA total (INR)'], ['loan_total_inr', 'Loan total (INR)'],
  ['isa_peak_inr', 'ISA peak (INR)'], ['loan_peak_inr', 'Loan peak (INR)'],
  ['isa_over_budget', 'ISA over budget'], ['loan_over_budget', 'Loan over budget'],
];

export function RiskGrid() {
  const inputs = useStore((state) => state.inputParams);
  const { data, busy, error, run, clear } = useDecision('risk');
  const [values, setValues] = useState({ low: '', high: '', rate: '4', fx: '20', points: '7' });
  const [foreign, setForeign] = useState(Boolean(inputs.loan_quote_currency && inputs.loan_quote_currency !== 'INR'));
  const bounds = { low: Math.round(inputs.annual_income_lpa * 75) / 100, high: Math.min(10000, Math.round(inputs.annual_income_lpa * 125) / 100) };
  const dataRows = data?.outcomes ?? [];
  const formatRange = (key) => {
    const values = dataRows.map((row) => row[key]);
    return `${INR.format(Math.min(...values))} to ${INR.format(Math.max(...values))}`;
  };
  useEffect(clear, [inputs, clear]);

  return <section className="card section-block" aria-labelledby="risk-grid-title">
    <h2 className="section-title" id="risk-grid-title">Combined salary, rate and exchange-rate stress test</h2>
    <p className="section-block">Test every combination of evenly spaced inputs using your Calculator terms. A rate shock raises the entered rate and resets. An exchange-rate shock increases regular foreign-loan repayments in INR and holds upfront charges fixed.</p>
    <form className="workspace-form" onSubmit={(event) => {
      event.preventDefault();
      run({ ...comparisonRequest(inputs), salary_low_lpa: Number(values.low || bounds.low), salary_high_lpa: Number(values.high || bounds.high),
        max_rate_increase: Number(values.rate) / 100, max_fx_increase: Number(values.fx) / 100, foreign_currency: foreign, points: Number(values.points) });
    }}>
      <fieldset className="planner-fieldset planner-field-grid" disabled={busy} aria-label="Ranges for the risk grid">
        {[
          ['low', 'Low starting salary (LPA)', 0, 10000], ['high', 'High starting salary (LPA)', 0, 10000],
          ['rate', 'Maximum rate increase (percentage points)', 0, 60], ['points', 'Steps per varying input', 3, 9, 1],
          ...(foreign ? [['fx', 'Maximum FX cost increase (%)', 0, 60]] : []),
        ].map(([key, label, min, max, step]) => <NumberField key={key} label={label} min={min} max={max} step={step} required
          value={values[key] === '' ? bounds[key] : values[key]} onChange={(value) => { setValues({ ...values, [key]: value }); clear(); }} />)}
      </fieldset>
      <label className="planner-ai-control"><input type="checkbox" checked={foreign} disabled={busy}
        onChange={(event) => { setForeign(event.target.checked); clear(); }} />Apply exchange-rate shocks to a foreign loan</label>
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Running stress test…' : 'Run combined stress test'}</button></div>
    </form>
    {error && <p role="alert" className="workspace-message">{error}</p>}
    {data && <div className="section-top">
      <p role="status">{dataRows.length} combinations tested. Counts describe this grid.</p>
      <dl className="financing-metrics">
        <div><dt>ISA total repayment</dt><dd>{formatRange('isa_total_inr')}</dd></div>
        <div><dt>Loan total repayment</dt><dd>{formatRange('loan_total_inr')}</dd></div>
        <div><dt>ISA peak monthly payment</dt><dd>{formatRange('isa_peak_inr')}</dd></div>
        <div><dt>Loan peak monthly payment</dt><dd>{formatRange('loan_peak_inr')}</dd></div>
      </dl>
      {data.assumptions.budget_inr != null && <p>At {INR.format(data.assumptions.budget_inr)} per month, the ISA exceeds budget in {dataRows.filter((row) => row.isa_over_budget).length} combinations and the loan in {dataRows.filter((row) => row.loan_over_budget).length}.</p>}
      <details className="schedule-details section-top"><summary>Inspect the tested values</summary>
        <ul>
          <li>Starting salary (LPA) {data.assumptions.salaries_lpa.join(', ')}</li>
          <li>Rate increase (percentage points) {data.assumptions.rate_increases.map((value) => Number((100 * value).toFixed(4))).join(', ')}</li>
          <li>FX repayment increase (%) {data.assumptions.fx_increases.map((value) => Number((100 * value).toFixed(4))).join(', ')}</li>
        </ul>
      </details>
      <button type="button" className="btn btn-secondary section-top" onClick={() => downloadWorkspaceCsv('isa-truth-risk-grid.csv', [
        RISK_COLS.map(([, label]) => label), ...dataRows.map((row) => RISK_COLS.map(([key]) => row[key])),
      ])}>Download all scenario outcomes</button>
    </div>}
  </section>;
}

export function PaymentExplanation({ schedule }) {
  const inputs = useStore((state) => state.inputParams);
  const { profile } = useAccount();
  const [question, setQuestion] = useState('');
  const [month, setMonth] = useState(1);
  const [ai, setAi] = useState(false);
  const [available, setAvailable] = useState(false);
  const { data, busy, error, run, clear } = useDecision('explain');
  useEffect(() => {
    if (!profile) return undefined;
    const controller = new AbortController();
    getPlannerCapabilities(controller.signal).then((result) => setAvailable(result.ai_available)).catch(() => {});
    return () => controller.abort();
  }, [profile]);
  return <details className="card schedule-details no-print">
    <summary>Ask about a payment or contract term</summary>
    <form className="workspace-form section-top" onSubmit={(event) => {
      event.preventDefault();
      run({ ...comparisonRequest(inputs), question: question.trim(), month: Number(month), use_ai: Boolean(profile && available && ai) });
    }}>
      <label className="workspace-field"><span>Your question</span><textarea rows={2} required minLength={3} maxLength={500}
        placeholder="Why did the payment jump in month 13?" disabled={busy} value={question} onChange={(event) => { setQuestion(event.target.value); clear(); }} /></label>
      <label className="workspace-field"><span>Month to inspect when the question omits it</span>
        <select value={month} disabled={busy} onChange={(event) => { setMonth(event.target.value); clear(); }}>
          {schedule.map((row) => <option key={row.month} value={row.month}>Month {row.month}{row.date && ` · ${row.date}`}</option>)}
        </select></label>
      {profile && available && <label className="planner-ai-control"><input type="checkbox" checked={ai} disabled={busy} onChange={(event) => setAi(event.target.checked)} />
        <span>Use AI to choose the relevant facts<small>Shares your question and the available categories. Keep personal details out of the question.</small></span></label>}
      <div><button type="submit" className="btn btn-secondary" disabled={busy || question.trim().length < 3}>{busy ? 'Checking the schedule…' : 'Explain this payment'}</button></div>
    </form>
    {error && <p role="alert" className="workspace-message">{error}</p>}
    {data && <div className="section-top" aria-live="polite"><h4>Month {data.month}</h4>
      <p className="workspace-meta">{data.mode === 'ai' ? 'AI-selected facts from your schedule' : 'Based on your calculated schedule'}</p>
      <ul>{data.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></div>}
  </details>;
}
