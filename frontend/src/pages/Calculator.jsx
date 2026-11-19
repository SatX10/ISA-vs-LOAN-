import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store.js';
import { saveContract } from '../api/client.js';
import {
  comparisonRequest, comparisonSchedule, formatDelta, formatLakhs, formatRate, lakhsToRupees,
} from '../comparison.js';
import SliderInput from '../components/SliderInput.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ComparisonChart from '../components/ComparisonChart.jsx';

export default function Calculator() {
  const { inputParams, results, loading, error, setParam, calculate, reset } = useStore();
  const [showCumulative, setShowCumulative] = useState(true);
  const [search, setSearch] = useSearchParams();
  const [openedSharedLink] = useState(() => search.size > 0);
  const [sharing, setSharing] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(null);
  const schedule = useMemo(() => comparisonSchedule(results), [results]);
  const shareQuery = new URLSearchParams(inputParams).toString();
  const shareUrl = new URL(`/?${shareQuery}`, window.location.origin).href;

  useEffect(() => {
    if (search.toString() !== shareQuery) setSearch(shareQuery, { replace: true });
  }, [search, setSearch, shareQuery]);

  useEffect(() => {
    if (openedSharedLink && !useStore.getState().results) calculate();
  }, [calculate, openedSharedLink]);

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

  return (
    <div>
      <div className="page-header">
        <h1>ISA vs Loan Calculator</h1>
        <p>Compare a share of your future salary with a fixed education loan for the same tuition.</p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="calculator-layout">
        {/* ── Inputs ── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Inputs</h2>

          <fieldset style={{ border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <legend style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              Common
            </legend>
            <SliderInput
              label="Loan / ISA Principal (₹)"
              value={inputParams.loan_amount}
              onChange={(v) => setParam('loan_amount', v)}
              min={50000} max={2000000} step={10000} unit=" ₹"
            />
            <SliderInput
              label="Starting Salary"
              value={inputParams.annual_income_lpa}
              onChange={(v) => setParam('annual_income_lpa', v)}
              min={1} max={50} step={0.5} unit=" LPA"
              decimals={1}
            />
            <SliderInput
              label="Income Growth Rate"
              value={inputParams.income_growth_pct}
              onChange={(v) => setParam('income_growth_pct', v)}
              min={0} max={30} step={0.5} unit="%"
              decimals={1}
            />
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <legend style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              ISA Terms
            </legend>
            <SliderInput
              label="ISA % of Monthly Income"
              value={inputParams.isa_pct}
              onChange={(v) => setParam('isa_pct', v)}
              min={1} max={30} step={0.5} unit="%"
              decimals={1}
            />
            <SliderInput
              label="Payment Cap (× Principal)"
              value={inputParams.isa_cap_multiple}
              onChange={(v) => setParam('isa_cap_multiple', v)}
              min={1} max={4} step={0.1} unit="×"
              decimals={1}
            />
            <SliderInput
              label="Income Trigger Threshold"
              value={inputParams.isa_trigger_lpa}
              onChange={(v) => setParam('isa_trigger_lpa', v)}
              min={0} max={15} step={0.5} unit=" LPA"
              decimals={1}
            />
            <SliderInput
              label="Max ISA Term"
              value={inputParams.isa_term_months}
              onChange={(v) => setParam('isa_term_months', v)}
              min={12} max={120} step={6} unit=" mo"
            />
            <SliderInput
              label="ISA Grace Period"
              value={inputParams.delay_months}
              onChange={(v) => setParam('delay_months', v)}
              min={0} max={24} unit=" mo"
            />
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <legend style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              Loan Terms
            </legend>
            <SliderInput
              label="Loan Interest Rate"
              value={inputParams.loan_rate_pct}
              onChange={(v) => setParam('loan_rate_pct', v)}
              min={0} max={36} step={0.25} unit="%"
              decimals={2}
            />
            <SliderInput
              label="Loan Term"
              value={inputParams.loan_term_months}
              onChange={(v) => setParam('loan_term_months', v)}
              min={6} max={120} step={6} unit=" mo"
            />
          </fieldset>

          <div className="button-row">
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={calculate}
              disabled={loading}
            >
              {loading ? 'Calculating…' : 'Calculate'}
            </button>
            <button className="btn btn-secondary" onClick={reset} disabled={loading}>
              Reset
            </button>
            <button className="btn btn-secondary" onClick={() => setSharing((open) => !open)}>
              Share
            </button>
          </div>
          {sharing && (
            <label className="contract-label">
              Shareable link
              <input readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
            </label>
          )}
        </div>

        {/* ── Results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
          {results ? (
            <>
              {/* KPI row */}
              <div className="grid-3">
                <KpiCard
                  label="Total ISA Paid"
                  value={formatLakhs(results.isa.total_paid)}
                  delta={formatRate(results.isa.effective_annual_rate)}
                  deltaType={
                    results.isa.effective_annual_rate == null ? 'neutral'
                      : results.isa.effective_annual_rate < results.loan.effective_annual_rate
                        ? 'positive' : 'neutral'
                  }
                  sub="Effective annual rate"
                />
                <KpiCard
                  label="Total Loan Paid"
                  value={formatLakhs(results.loan.total_paid)}
                  delta={formatRate(results.loan.effective_annual_rate)}
                  deltaType="neutral"
                  sub={`EMI ${formatLakhs(results.loan.emi)}/mo`}
                />
                <KpiCard
                  label="ISA Minus Loan"
                  value={formatDelta(results.summary.delta)}
                  delta={results.summary.winner === 'Tie' ? 'Tie' : `${results.summary.winner} is cheaper`}
                  deltaType={results.summary.winner === 'ISA' ? 'positive' : results.summary.winner === 'Loan' ? 'negative' : 'neutral'}
                />
              </div>
              {results.summary.never_pays && (
                <p className="card" role="status">ISA costs you ₹0 in this scenario. An annual rate cannot be calculated without payments.</p>
              )}

              {/* Chart */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className="section-title" style={{ marginBottom: 0 }}>Payment Schedule</h2>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => setShowCumulative((v) => !v)}
                  >
                    {showCumulative ? '📈 Show Monthly' : '📉 Show Cumulative'}
                  </button>
                </div>
                <ComparisonChart
                  schedule={schedule}
                  height={300}
                  showCumulative={showCumulative}
                  cap={lakhsToRupees(results.isa.total_cap)}
                />
              </div>

              {/* Detail table */}
              <div className="card">
                <h2 className="section-title">ISA Details</h2>
                <table className="data-table">
                  <tbody>
                    <tr><th>Months with payments</th><td>{results.isa.months_paid}</td></tr>
                    <tr><th>Month cap was reached</th><td>{results.isa.months_to_payoff ?? '—'}</td></tr>
                    <tr><th>Total paid</th><td>{formatLakhs(results.isa.total_paid)}</td></tr>
                    <tr><th>Cap reached?</th><td>{results.isa.payment_cap_hit ? 'Yes' : 'No'}</td></tr>
                    <tr><th>Effective annual rate</th><td>{formatRate(results.isa.effective_annual_rate)}</td></tr>
                    <tr><th>Nominal annual rate</th><td>{formatRate(results.isa.nominal_annual_rate)}</td></tr>
                  </tbody>
                </table>
              </div>
              <form className="card" onSubmit={handleSave}>
                <h2 className="section-title">Save Contract</h2>
                <label className="contract-label">
                  Contract name
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={120}
                    required
                  />
                </label>
                <button className="btn btn-primary" disabled={saving || !label.trim()}>
                  {saving ? 'Saving…' : 'Save Contract'}
                </button>
                {saveFeedback?.results === results && (
                  <p className={saveFeedback.error ? 'error-banner' : undefined} role="status">
                    {saveFeedback.message}
                  </p>
                )}
              </form>
            </>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: 'var(--color-text-muted)' }}>
              {loading ? (
                <span className="loading-spinner">⏳ Running simulation…</span>
              ) : (
                <span>Adjust inputs and press <strong>Calculate</strong> to see results.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
