import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartLine, ChevronDown, Copy, Info } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store.js';
import { saveContract } from '../api/client.js';
import {
  comparisonRequest, comparisonSchedule, comparisonShareUrl, formatDelta, formatLakhs, formatRate, lakhsToRupees,
} from '../comparison.js';
import AdvancedTerms from '../components/AdvancedTerms.jsx';
import PaymentInsights from '../components/PaymentInsights.jsx';
import SliderInput from '../components/SliderInput.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ComparisonChart from '../components/ComparisonChart.jsx';
import LoadingPanel from '../components/LoadingPanel.jsx';

const INPUT_GROUPS = [
  {
    title: 'Tuition and income',
    fields: [
      { key: 'loan_amount', api: ['isa.principal', 'loan.principal'], label: 'Tuition amount',
        min: 50000, max: 2000000, step: 10000, unit: ' ₹', help: 'The amount financed by either option.' },
      { key: 'annual_income_lpa', api: ['isa.starting_income_lpa'], label: 'Starting salary',
        min: 1, max: 50, step: 0.5, unit: ' LPA', decimals: 1, help: 'Your expected gross annual salary. One LPA is ₹1,00,000 per year.' },
      { key: 'income_growth_pct', api: ['isa.annual_income_growth_rate'], label: 'Salary growth',
        min: 0, max: 30, step: 0.5, unit: '%', decimals: 1, help: 'The assumed year-over-year increase in your salary.' },
    ],
  },
  {
    title: 'ISA terms',
    expandable: true,
    fields: [
      { key: 'isa_pct', api: ['isa.income_share_pct'], label: 'ISA % of Monthly Income',
        min: 1, max: 30, step: 0.5, unit: '%', decimals: 1, help: 'The share of each eligible month’s income paid under the ISA.' },
      { key: 'isa_cap_multiple', api: ['isa.max_multiple'], label: 'Payment Cap (× Principal)',
        min: 1, max: 4, step: 0.1, unit: '×', decimals: 1, help: 'The most you can repay under the ISA, expressed as a multiple of the amount financed.' },
      { key: 'isa_trigger_lpa', api: ['isa.trigger_threshold_lpa'], label: 'Income Trigger Threshold',
        min: 0, max: 15, step: 0.5, unit: ' LPA', decimals: 1, help: 'The annual income threshold below which ISA payments are zero.' },
      { key: 'isa_term_months', api: ['isa.term_months'], label: 'Max ISA Term',
        min: 12, max: 120, step: 6, unit: ' mo', help: 'The maximum length of the ISA payment window in months.' },
      { key: 'delay_months', api: ['isa.delay_months'], label: 'ISA Grace Period',
        min: 0, max: 24, step: 1, unit: ' mo', help: 'The waiting period before the ISA payment window begins.' },
    ],
  },
  {
    title: 'Loan terms',
    expandable: true,
    fields: [
      { key: 'loan_rate_pct', api: ['loan.annual_interest_rate'], label: 'Loan Interest Rate',
        min: 0, max: 36, step: 0.25, unit: '%', decimals: 2, help: 'The nominal annual interest rate on the loan.' },
      { key: 'loan_term_months', api: ['loan.term_months'], label: 'Loan Term',
        min: 6, max: 120, step: 6, unit: ' mo', help: 'The number of months over which the loan is repaid.' },
    ],
  },
];

const FIELD_BY_PATH = new Map(INPUT_GROUPS.flatMap(({ fields }) =>
  fields.flatMap(({ key, api }) => api.map((path) => [path, key]))));

function groupErrors(error) {
  const fields = {};
  const general = [];
  if (!error) return { fields, general };

  for (const message of error.split('; ')) {
    const separator = message.indexOf(': ');
    const key = separator >= 0 ? FIELD_BY_PATH.get(message.slice(0, separator)) : undefined;
    if (!key) {
      general.push(message);
      continue;
    }

    const detail = message.slice(separator + 2);
    fields[key] = fields[key] ? `${fields[key]} ${detail}` : detail;
  }
  return { fields, general };
}

function DashboardLoading() {
  return (
    <LoadingPanel label="Running simulation">
      <div className="repayment-totals">
        {['isa', 'loan', 'difference'].map((key) => (
          <div key={key} className="card kpi-card">
            <div className="skeleton skeleton-line-short" />
            <div className="skeleton skeleton-kpi-value" />
            <div className="skeleton skeleton-line-short" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="chart-heading">
          <div className="skeleton skeleton-chart-title" />
          <div className="skeleton skeleton-chart-action" />
        </div>
        <div className="skeleton skeleton-chart" />
      </div>
    </LoadingPanel>
  );
}

export default function Calculator() {
  const { inputParams, results, loading, error, setParam, calculate, reset } = useStore();
  const [showCumulative, setShowCumulative] = useState(true);
  const [search] = useSearchParams();
  const [openedSharedLink] = useState(() => search.size > 0);
  const [sharing, setSharing] = useState(false);
  const [shareIncome, setShareIncome] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [formRevision, setFormRevision] = useState(0);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const inputsForm = useRef(null);
  const linkInput = useRef(null);
  const resultsHeading = useRef(null);
  const focusResults = useRef(false);
  const schedule = useMemo(() => comparisonSchedule(results), [results]);
  const shareUrl = comparisonShareUrl(inputParams, shareIncome);

  useEffect(() => {
    if (openedSharedLink && !useStore.getState().results) calculate();
  }, [calculate, openedSharedLink]);

  useEffect(() => {
    if (error) {
      for (const group of inputsForm.current.querySelectorAll('details[data-invalid]')) {
        group.open = true;
      }
    }
  }, [error]);

  useLayoutEffect(() => {
    if (loading || !focusResults.current) return;
    focusResults.current = false;
    const heading = resultsHeading.current;
    if (!results || !heading) return;
    heading.focus({ preventScroll: true });
    const { top } = heading.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight / 2) heading.scrollIntoView({ block: 'start' });
  }, [loading, results]);

  function handleCalculate(event) {
    event.preventDefault();
    focusResults.current = true;
    calculate();
  }

  function handleReset() {
    reset();
    setFormRevision((revision) => revision + 1);
    setCopyFeedback(null);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback({ url: shareUrl, message: 'Link copied.' });
    } catch {
      linkInput.current?.focus();
      setCopyFeedback({ url: shareUrl, message: 'Select and copy the link from the field.' });
    }
  }

  const handleSave = async (event) => {
    event.preventDefault();
    const name = label.trim();
    if (!name || saving) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      await saveContract(name, comparisonRequest(inputParams));
      setLabel('');
      setSaveFeedback({ results, message: 'Contract saved.' });
    } catch (err) {
      setSaveFeedback({ results, message: err.message, error: true });
    } finally {
      setSaving(false);
    }
  };

  const { fields: fieldErrors, general: generalErrors } = groupErrors(error);
  const winner = results?.summary.winner;
  const neverPays = results?.summary.never_pays;
  const costTone = neverPays ? 'neutral' : winner === 'ISA' ? 'lower' : winner === 'Loan' ? 'higher' : 'neutral';
  const costLabel = winner === 'ISA' ? 'ISA costs less' : winner === 'Loan' ? 'ISA costs more' : 'Tie';

  return (
    <div>
      <header className="page-header">
        <h1>ISA vs Loan Calculator</h1>
        <p>Compare a share of your future salary with a loan for the same education funding.</p>
        <Link to="/workspace" className="workspace-text-link">Compare multiple offers</Link>
      </header>

      {generalErrors.length > 0 && <p className="error-banner" role="alert">{generalErrors.join(' ')}</p>}

      <div className="calculator-layout">
        <form
          className="card calculator-inputs"
          aria-labelledby="calculator-inputs-title"
          ref={inputsForm}
          onSubmit={handleCalculate}
          onInvalid={(event) => {
            const group = event.target.closest('.calculator-term-group');
            if (group) group.open = true;
          }}
        >
          <h2 className="section-title" id="calculator-inputs-title" tabIndex={-1}>Financing inputs</h2>
          <div className="button-row calculator-actions">
            <button type="submit" className="btn btn-primary calculate-action" disabled={loading}>
              {loading ? 'Calculating…' : 'Calculate'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={loading}>Reset</button>
            <button type="button" className="btn btn-secondary" aria-expanded={sharing}
              aria-controls="calculator-share" onClick={() => setSharing((open) => !open)}>Share</button>
          </div>
          <div className="calculator-share" id="calculator-share" hidden={!sharing}>
            <label className="planner-ai-control">
              <input type="checkbox" checked={shareIncome} onChange={(event) => setShareIncome(event.target.checked)} />
              Include salary and budget in the link
            </label>
            <label className="contract-label">
              Shareable link
              <input type="url" ref={linkInput} readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
            </label>
            <button type="button" className="btn btn-secondary" onClick={copyShareLink}>
              <Copy size={16} aria-hidden="true" /> Copy link
            </button>
            <p className="copy-feedback" role="status">{copyFeedback?.url === shareUrl ? copyFeedback.message : ''}</p>
          </div>
          <div className="calculator-groups" key={formRevision}>
            {INPUT_GROUPS.map(({ title, expandable, fields }) => {
              const fieldset = (
                <fieldset className="calculator-fieldset" key={title}>
                  <legend className={expandable ? 'visually-hidden' : undefined}>{title}</legend>
                  <div className="calculator-fields">
                    {fields.map(({ key, api: _api, ...field }) => (
                      <SliderInput
                        key={key}
                        {...field}
                        min={Math.min(field.min, inputParams[key])}
                        max={Math.max(field.max, inputParams[key])}
                        value={inputParams[key]}
                        onChange={(value) => setParam(key, value)}
                        error={fieldErrors[key]}
                      />
                    ))}
                  </div>
                </fieldset>
              );

              return expandable ? (
                <details className="calculator-term-group" key={title}
                  data-invalid={fields.some(({ key }) => fieldErrors[key]) ? '' : undefined}>
                  <summary>
                    {title}
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  {fieldset}
                </details>
              ) : fieldset;
            })}
            <AdvancedTerms inputs={inputParams} onChange={setParam} />
          </div>
        </form>

        <section className="calculator-results" aria-labelledby="calculator-results-title">
          <div className="results-heading">
            <h2 id="calculator-results-title" ref={resultsHeading} tabIndex={-1} className="results-title">Repayment comparison</h2>
            {results && <a href="#calculator-inputs-title" className="edit-calculator-inputs">Edit inputs</a>}
          </div>
          {loading && !results ? <DashboardLoading /> : !results ? (
            <div className="card calculator-empty">
              <ChartLine size={24} strokeWidth={1.75} aria-hidden="true" />
              <h3>See how the payments compare</h3>
              <p>Calculate to see the total cost, effective annual rates, and month-by-month payments.</p>
            </div>
          ) : (
            <>
              <div className="repayment-totals">
                <KpiCard label="Total ISA paid" value={formatLakhs(results.isa.total_paid)}
                  rate={formatRate(results.isa.effective_annual_rate)} />
                <KpiCard label="Total loan paid" value={formatLakhs(results.loan.total_paid)}
                  rate={formatRate(results.loan.effective_annual_rate)}
                  note={`First regular payment ${formatLakhs(results.loan.emi)}`} />
                <KpiCard label="ISA minus loan" value={formatDelta(results.summary.delta)}
                  badge={costLabel} tone={costTone} />
              </div>
              {neverPays && (
                <p className="card status-neutral result-notice" role="status">
                  <Info size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span>ISA costs you ₹0 in this scenario. An annual rate cannot be calculated without payments.</span>
                </p>
              )}

              <section className="card" aria-labelledby="payment-schedule-title">
                <div className="chart-heading">
                  <h3 className="section-title" id="payment-schedule-title">Payment schedule</h3>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => setShowCumulative((value) => !value)}>
                    <ChartLine size={17} strokeWidth={1.75} aria-hidden="true" />
                    {showCumulative ? 'Show monthly' : 'Show cumulative'}
                  </button>
                </div>
                <ComparisonChart schedule={schedule} showCumulative={showCumulative}
                  cap={lakhsToRupees(results.isa.total_cap)} budget={results.affordability?.budget_inr}
                  firstShortfall={Math.min(...['isa', 'loan'].map(key => results.affordability?.[key].first_over_budget_month ?? Infinity))} />
              </section>

              <PaymentInsights results={results} schedule={schedule} />

              <section className="card" aria-labelledby="isa-details-title">
                <h3 className="section-title" id="isa-details-title">ISA details</h3>
                <table className="data-table" aria-labelledby="isa-details-title">
                  <tbody>
                    <tr><th scope="row">Months with payments</th><td>{results.isa.months_paid}</td></tr>
                    <tr><th scope="row">Month cap was reached</th><td>{results.isa.months_to_payoff ?? '—'}</td></tr>
                    <tr><th scope="row">Total paid</th><td>{formatLakhs(results.isa.total_paid)}</td></tr>
                    <tr><th scope="row">Cap reached?</th><td>{results.isa.payment_cap_hit ? 'Yes' : 'No'}</td></tr>
                    <tr><th scope="row">Agreement ends at</th><td>{{
                      cap: 'Repayment cap', term: 'Payment term', window: 'Maximum payment window',
                    }[results.isa.end_reason]}</td></tr>
                    <tr><th scope="row">Effective annual rate</th><td>{formatRate(results.isa.effective_annual_rate)}</td></tr>
                    <tr><th scope="row">Nominal annual rate</th><td>{formatRate(results.isa.nominal_annual_rate)}</td></tr>
                  </tbody>
                </table>
              </section>
              <form className="card" onSubmit={handleSave}>
                <h3 className="section-title">Save contract</h3>
                <label className="contract-label">
                  Contract name
                  <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={saving || !label.trim()}>
                  {saving ? 'Saving…' : 'Save contract'}
                </button>
                {saveFeedback?.results === results && (
                  <p className={saveFeedback.error ? 'error-banner' : undefined} role="status">{saveFeedback.message}</p>
                )}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
