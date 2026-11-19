import { useEffect, useState } from 'react';
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

const DEFAULT_INCOMES = [6, 9, 12];

export default function Scenarios() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customIncome, setCustomIncome] = useState('');
  const [incomes, setIncomes] = useState(DEFAULT_INCOMES);
  const inputParams = useStore((state) => state.inputParams);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getScenarios(comparisonRequest(inputParams), incomes, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [inputParams, incomes]);

  const chartData = data.map((s) => ({
    name: s.label,
    'ISA Total': s.isa_total_paid,
    'Loan Total': s.loan_total_paid,
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Salary Scenarios</h1>
        <p>See how starting salary changes the outcome using your calculator terms.</p>
      </div>
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

      {error && <div className="error-banner">⚠️ {error}</div>}

      {loading ? (
        <div className="loading-spinner">⏳ Loading scenarios…</div>
      ) : !error && data.length > 0 && (
        <>
          {/* Bar chart */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title">Total Cost Comparison</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `₹${v}L`}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  width={60}
                />
                <Tooltip
                  formatter={formatLakhs}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.82rem' }} />
                <Bar dataKey="ISA Total" fill="var(--color-chart-isa)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Loan Total" fill="var(--color-chart-loan)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="card">
            <h2 className="section-title">Scenario Details</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Income (LPA)</th>
                    <th>ISA Total Paid</th>
                    <th>Loan Total Paid</th>
                    <th>Month Cap Reached</th>
                    <th>Effective ISA Rate</th>
                    <th>Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((s) => (
                      <tr key={s.starting_income_lpa}>
                        <td>{s.label}</td>
                        <td>{s.starting_income_lpa}</td>
                        <td>{formatLakhs(s.isa_total_paid)}</td>
                        <td>{formatLakhs(s.loan_total_paid)}</td>
                        <td>{s.isa_months_to_payoff ?? '—'}</td>
                        <td>{formatRate(s.isa_effective_rate)}</td>
                        <td>{s.winner}</td>
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
