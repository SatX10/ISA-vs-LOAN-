import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { INR, formatLakhs } from '../comparison.js';

const AXIS = { fill: 'var(--chart-axis)', fontSize: 11 };
const COMPACT = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const TOOLTIP = { background: 'var(--surface-elevated)', borderColor: 'var(--border)', color: 'var(--text)' };

export function SalaryCostChart({ curve, boundary }) {
  if (!curve?.length) return null;
  return (
    <section className="card section-top">
      <h2 className="section-title">Total repayment by starting salary</h2>
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} accessibilityLayer margin={{ right: 16, left: 6 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-rule)" />
            <XAxis dataKey="salary_lpa" type="number" domain={['dataMin', 'dataMax']} tick={AXIS}
              tickFormatter={(value) => `${Number(value.toFixed(1))} LPA`} />
            <YAxis width={70} tick={AXIS} tickFormatter={formatLakhs} />
            <Tooltip contentStyle={TOOLTIP} formatter={formatLakhs}
              labelFormatter={(value) => `${Number(value.toFixed(4))} LPA`} />
            <Line dataKey="isa_total" name="ISA" stroke="var(--series-isa)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="loan_total" name="Loan" stroke="var(--series-loan)" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
            {boundary != null && <ReferenceLine x={boundary} stroke="var(--notice)" strokeDasharray="3 4" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="workspace-meta">Solid line: ISA. Dashed line: loan. Open the sample table for individual values.</p>
      <details className="schedule-details section-top">
        <summary>Salary and repayment sample table</summary>
        <div className="table-scroll report-schedule"><table className="data-table">
          <thead><tr><th>Salary</th><th>ISA</th><th>Loan</th></tr></thead>
          <tbody>{curve.map((row) => <tr key={row.salary_lpa}>
            <th scope="row">{Number(row.salary_lpa.toFixed(4))} LPA</th><td>{formatLakhs(row.isa_total)}</td><td>{formatLakhs(row.loan_total)}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </section>
  );
}

export function SensitivityRanking({ rows }) {
  if (!rows?.length) return null;
  return (
    <section className="card section-top">
      <h2 className="section-title">What shifts the comparison most</h2>
      <p className="section-block">Each row changes one assumption. Positive values increase ISA cost relative to the loan.</p>
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ right: 14 }} accessibilityLayer>
            <XAxis type="number" tick={AXIS} tickFormatter={COMPACT.format} />
            <YAxis dataKey="label" width={130} type="category" tick={AXIS} />
            <ReferenceLine x={0} stroke="var(--chart-axis)" />
            <Tooltip contentStyle={TOOLTIP} formatter={INR.format} />
            <Bar dataKey="change_inr" name="Change in ISA minus loan cost" fill="var(--accent)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <dl className="financing-metrics">{rows.map(({ label, change_inr: amount }) => (
        <div key={label}><dt>{label}</dt><dd>{amount > 0 ? '+' : ''}{INR.format(amount)}</dd></div>
      ))}</dl>
    </section>
  );
}

function RemainingChart({ schedule, dataKey, title, color }) {
  return (
    <section>
      <h4>{title}</h4>
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={schedule} accessibilityLayer margin={{ right: 12 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-rule)" />
            <XAxis dataKey="month" tick={AXIS} tickFormatter={(month) => `M${month}`} />
            <YAxis width={55} tick={AXIS} tickFormatter={COMPACT.format} />
            <Tooltip contentStyle={TOOLTIP} formatter={INR.format} labelFormatter={(month) => `Month ${month}`} />
            <Line dataKey={dataKey} name={title} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function LoanCostBreakdown({ loan }) {
  let running = 0;
  const rows = [
    ['Net funding', loan.principal],
    ['Borrowed fees', loan.financed_cost + loan.withheld_fee],
    ['Interest', loan.total_interest],
    ['Cash fees', loan.upfront_fee + loan.regular_fees],
  ].filter(([, amount]) => amount > 0).map(([label, amount]) => {
    const row = { label, previous: running, increase: amount };
    running += amount;
    return row;
  });
  rows.push({ label: 'Total', previous: 0, increase: loan.total_paid });
  return (
    <div className="chart-plot">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ right: 14, left: 5 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-rule)" />
          <XAxis type="number" tick={AXIS} tickFormatter={(value) => COMPACT.format(value * 100_000)} />
          <YAxis type="category" dataKey="label" width={92} tick={AXIS} />
          <Tooltip contentStyle={TOOLTIP} formatter={formatLakhs} />
          <Bar dataKey="previous" stackId="cost" fill="transparent" tooltipType="none" isAnimationActive={false} />
          <Bar dataKey="increase" name="Component cost" stackId="cost" fill="var(--series-loan)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RemainingCharts({ schedule }) {
  return (
    <div className="grid-2">
      <RemainingChart schedule={schedule} dataKey="loan_balance" title="Loan balance" color="var(--series-loan)" />
      <RemainingChart schedule={schedule} dataKey="isa_remaining_cap" title="Amount left before ISA cap" color="var(--series-isa)" />
    </div>
  );
}
