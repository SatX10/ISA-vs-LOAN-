import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { INR } from '../comparison.js';
import { CASES } from '../offerWorkspace.js';

const COMPACT = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const AXIS = { fill: 'var(--chart-axis)', fontSize: 11 };
const TOOLTIP = { background: 'var(--surface-elevated)', borderColor: 'var(--border)', color: 'var(--text)' };

export function OfferCostChart({ offers, scenario }) {
  const rows = offers.filter((offer) => offer.cases[scenario]).map(({ label, cases }) => ({
    label, total: cases[scenario].total_inr, peak: cases[scenario].peak_inr,
  }));
  if (!rows.length) return null;
  return (
    <section className="card">
      <h3 className="section-title">Total cost and largest monthly payment</h3>
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart accessibilityLayer margin={{ right: 26, bottom: 12, left: 4 }}>
            <CartesianGrid stroke="var(--chart-rule)" />
            <XAxis type="number" dataKey="total" name="Total cost" tick={AXIS} tickFormatter={COMPACT.format}
              label={{ value: 'Total cost (₹)', position: 'insideBottom', offset: -5, fill: 'var(--chart-axis)' }} />
            <YAxis type="number" dataKey="peak" name="Peak month" tick={AXIS} tickFormatter={COMPACT.format}
              label={{ value: 'Peak month (₹)', angle: -90, position: 'insideLeft', fill: 'var(--chart-axis)' }} />
            <Tooltip contentStyle={TOOLTIP} formatter={(amount) => INR.format(amount)}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload;
                return active && row ? (
                  <div className="chart-tooltip">
                    <b>{row.label}</b>
                    <p>Total {INR.format(row.total)}</p><p>Peak {INR.format(row.peak)}</p>
                  </div>
                ) : null;
              }} />
            <Scatter data={rows} fill="var(--accent)" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <details className="schedule-details section-top"><summary>Read cost chart values</summary>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Cost chart data">
          <table className="data-table">
            <thead><tr><th scope="col">Offer</th><th scope="col">Total repayment</th><th scope="col">Peak monthly payment</th></tr></thead>
            <tbody>{rows.map(({ label, total, peak }, index) => <tr key={index}><th scope="row">{label}</th>
              <td>{INR.format(total)}</td><td>{INR.format(peak)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function OfferStressChart({ offer }) {
  const rows = Object.entries(offer.cases).map(([key, result]) => ({ scenario: key, total: result.total_inr }));
  return (
    <section className="card">
      <h3 className="section-title">Scenario totals for {offer.label}</h3>
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} accessibilityLayer layout="vertical" margin={{ right: 24 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-rule)" />
            <XAxis type="number" tick={AXIS} tickFormatter={COMPACT.format} />
            <YAxis type="category" width={125} dataKey="scenario" tick={AXIS} tickFormatter={(key) => CASES[key]} />
            <Tooltip contentStyle={TOOLTIP} formatter={(value) => INR.format(value)} labelFormatter={(key) => CASES[key]} />
            <Bar name="Total repayment" dataKey="total" fill="var(--accent)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <dl className="financing-metrics">
        {rows.map(({ scenario, total }) => <div key={scenario}><dt>{CASES[scenario]}</dt><dd>{INR.format(total)}</dd></div>)}
      </dl>
    </section>
  );
}

export function ActualPaymentsChart({ rows }) {
  return (
    <>
    <div className="chart-plot">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} accessibilityLayer margin={{ right: 22, left: 12 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-rule)" />
          <XAxis dataKey="month" tick={AXIS} tickFormatter={(month) => `M${month}`} />
          <YAxis tick={AXIS} width={53} tickFormatter={COMPACT.format} />
          <Tooltip contentStyle={TOOLTIP} formatter={(amount) => INR.format(amount)}
            labelFormatter={(month) => `Month ${month}`} />
          <Line dataKey="planned" name="Projected" stroke="var(--series-loan)" strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          <Line dataKey="actual" name="Logged" stroke="var(--series-isa)" dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <details className="schedule-details section-top"><summary>Read planned and logged payment amounts</summary>
      <div className="table-scroll report-schedule" tabIndex={0} role="region" aria-label="Planned and actual payment data">
        <table className="data-table"><thead><tr><th scope="col">Month</th><th scope="col">Planned</th><th scope="col">Logged</th></tr></thead>
          <tbody>{rows.map(({ month, planned, actual }) => <tr key={month}><th scope="row">{month}</th><td>{INR.format(planned)}</td>
            <td>{actual == null ? 'No payment logged' : INR.format(actual)}</td></tr>)}</tbody></table>
      </div>
    </details>
    </>
  );
}
