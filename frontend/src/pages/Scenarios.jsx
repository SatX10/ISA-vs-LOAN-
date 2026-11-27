import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getScenarios } from '../api/client.js';
import { comparisonRequest, formatLakhs, formatRate } from '../comparison.js';
import { useStore } from '../state/store.js';
import ChartTooltip from '../components/ChartTooltip.jsx';
import LoadingPanel from '../components/LoadingPanel.jsx';
import ResponsiveCell from '../components/ResponsiveCell.jsx';

const DEFAULT_INCOMES = [6, 9, 12];
const AXIS_TEXT = { fill: 'var(--chart-axis)', fontSize: 11 };

export default function Scenarios() {
  const [response, setResponse] = useState(null);
  const [customIncome, setCustomIncome] = useState('');
  const [incomes, setIncomes] = useState(DEFAULT_INCOMES);
  const inputParams = useStore((state) => state.inputParams);
  const hasComparison = useStore((state) => state.results != null);

  useEffect(() => {
    if (!hasComparison) return undefined;
    const controller = new AbortController();
    getScenarios(comparisonRequest(inputParams), incomes, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResponse({ inputParams, incomes, data }); })
      .catch((error) => { if (!controller.signal.aborted) setResponse({ inputParams, incomes, error: error.message }); });
    return () => controller.abort();
  }, [hasComparison, inputParams, incomes]);

  const heading = (
    <header className="page-header">
      <h1>Salary Scenarios</h1>
      <p>See how starting salary changes the outcome using your calculator terms.</p>
    </header>
  );
  if (!hasComparison) {
    return (
      <div>
        {heading}
        <section className="card reading-width">
          <h2 className="section-title">Start with a comparison</h2>
          <p>Enter your offer terms in Calculator and select Calculate to see salary scenarios.</p>
          <Link className="btn btn-secondary section-top" to="/calculator">Open Calculator</Link>
        </section>
      </div>
    );
  }

  const current = response?.inputParams === inputParams && response.incomes === incomes ? response : null;
  const { data = [], error } = current ?? {};
  const loading = !current;
  const chartData = data.map((s) => ({
    name: s.label,
    'ISA Total': s.isa_total_paid,
    'Loan Total': s.loan_total_paid,
  }));

  return (
    <div>
      {heading}
      <form className="card button-row section-block" onSubmit={(event) => {
        event.preventDefault();
        const value = Number(customIncome);
        setIncomes([...new Set([...DEFAULT_INCOMES, value])].sort((a, b) => a - b));
      }}>
        <label className="contract-label">
          Custom starting salary (LPA)
          <input type="number" required min="0.01" max="100" step="any" value={customIncome}
            onChange={(event) => setCustomIncome(event.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={loading}>Compare salary</button>
        {incomes.length > DEFAULT_INCOMES.length && (
          <button className="btn btn-secondary" type="button" onClick={() => {
            setIncomes(DEFAULT_INCOMES);
            setCustomIncome('');
          }}>Clear custom salary</button>
        )}
      </form>

      {error && <p className="error-banner" role="alert">{error}</p>}

      {loading ? (
        <LoadingPanel label="Loading scenarios">
          <section className="card section-block">
            <div className="skeleton skeleton-line-short section-block" />
            <div className="skeleton skeleton-chart" />
          </section>
        </LoadingPanel>
      ) : !error && data.length > 0 && (
        <>
          {/* Bar chart */}
          <section className="card section-block">
            <h2 className="section-title">Total Cost Comparison</h2>
            <div className="chart-plot">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" strokeOpacity={0.15} />
                  <XAxis dataKey="name" tick={AXIS_TEXT} tickMargin={8} tickLine={false}
                    axisLine={{ stroke: 'var(--chart-rule)' }} />
                  <YAxis tickFormatter={(value) => `₹${value}L`} width={48}
                    tick={AXIS_TEXT} tickLine={false} axisLine={false} tickMargin={6} />
                  <Tooltip content={<ChartTooltip formatValue={formatLakhs} />} isAnimationActive={false}
                    cursor={{ fill: 'var(--surface-hover)' }} />
                  <Legend />
                  <Bar dataKey="ISA Total" fill="var(--series-isa)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="Loan Total" fill="var(--series-loan)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Table */}
          <div className="card">
            <h2 className="section-title" id="scenario-details-title">Scenario Details</h2>
            <div className="table-scroll">
              <table className="data-table responsive-table" role="table" aria-labelledby="scenario-details-title">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">Scenario</th>
                    <th role="columnheader" scope="col">Income (LPA)</th>
                    <th role="columnheader" scope="col">ISA Total Paid</th>
                    <th role="columnheader" scope="col">Loan Total Paid</th>
                    <th role="columnheader" scope="col">Month Cap Reached</th>
                    <th role="columnheader" scope="col">Effective ISA Rate</th>
                    <th role="columnheader" scope="col">Winner</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {data.map((s) => (
                    <tr key={s.starting_income_lpa} role="row">
                      <th scope="row" role="rowheader">{s.label}</th>
                      <ResponsiveCell label="Income (LPA)">{s.starting_income_lpa}</ResponsiveCell>
                      <ResponsiveCell label="ISA total paid">{formatLakhs(s.isa_total_paid)}</ResponsiveCell>
                      <ResponsiveCell label="Loan total paid">{formatLakhs(s.loan_total_paid)}</ResponsiveCell>
                      <ResponsiveCell label="Month cap reached">{s.isa_months_to_payoff ?? '—'}</ResponsiveCell>
                      <ResponsiveCell label="Effective ISA rate">{formatRate(s.isa_effective_rate)}</ResponsiveCell>
                      <ResponsiveCell label="Winner">{s.winner}</ResponsiveCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
