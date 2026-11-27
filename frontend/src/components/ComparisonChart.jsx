import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { INR } from '../comparison.js';
import ChartTooltip from './ChartTooltip.jsx';

const AXIS_TEXT = { fill: 'var(--chart-axis)', fontSize: 11 };
const AXIS_RULE = { stroke: 'var(--chart-rule)' };
const ISA_LINE = 'var(--series-isa)';
const LOAN_LINE = 'var(--series-loan)';
const RUPEE_TICKS = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1,
});

export default function ComparisonChart({ schedule, showCumulative, cap, budget, firstShortfall }) {
  const isaKey = showCumulative ? 'cumulative_isa' : 'isa_payment';
  const loanKey = showCumulative ? 'cumulative_loan' : 'loan_emi';
  const isaLabel = showCumulative ? 'Cumulative ISA' : 'ISA Payment';
  const loanLabel = showCumulative ? 'Cumulative loan' : 'Loan payment';

  if (!schedule.length) return <p className="dashboard-placeholder">No monthly payment data.</p>;

  return (
    <div className="chart-plot">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={schedule} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--chart-grid)" strokeOpacity={0.15} />
          <XAxis dataKey="month" interval="preserveStartEnd" minTickGap={24} tickMargin={8}
            tick={AXIS_TEXT} tickLine={false} axisLine={AXIS_RULE}
            tickFormatter={(month) => `M${month}`} />
          <YAxis tickFormatter={RUPEE_TICKS.format} width={58}
            tick={AXIS_TEXT} tickLine={false} axisLine={false} tickMargin={6} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 4' }}
            content={<ChartTooltip formatLabel={(month) => `Month ${month}`} formatValue={INR.format} />}
          />
          <Legend />
          <Line type="linear" dataKey={isaKey} name={isaLabel} stroke={ISA_LINE} strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: ISA_LINE, stroke: 'var(--surface)' }} isAnimationActive={false} />
          <Line type="linear" dataKey={loanKey} name={loanLabel} stroke={LOAN_LINE} strokeWidth={2} strokeDasharray="6 4"
            dot={false} activeDot={{ r: 4, fill: LOAN_LINE, stroke: 'var(--surface)' }} isAnimationActive={false} />
          {showCumulative && cap != null && (
            <ReferenceLine y={cap} ifOverflow="extendDomain"
              stroke="var(--chart-axis)" strokeDasharray="5 4"
              label={{ value: 'ISA cap', position: 'insideTopLeft', fill: 'var(--chart-axis)', fontSize: 11 }} />
          )}
          {!showCumulative && budget != null && (
            <ReferenceLine y={budget} ifOverflow="extendDomain" stroke="var(--notice)" strokeDasharray="5 4"
              label={{ value: 'Monthly budget', position: 'insideTopLeft', fill: 'var(--chart-axis)', fontSize: 11 }} />
          )}
          {!showCumulative && Number.isFinite(firstShortfall) && (
            <ReferenceLine x={firstShortfall} stroke="var(--notice)" strokeDasharray="2 5" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
