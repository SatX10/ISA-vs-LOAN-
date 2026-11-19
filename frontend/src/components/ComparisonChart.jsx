import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { INR } from '../comparison.js';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.6rem 0.9rem',
        fontSize: '0.82rem',
        boxShadow: '0 4px 12px var(--color-shadow-md)',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: 'var(--color-text-primary)' }}>
        Month {label}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {INR.format(entry.value)}
        </p>
      ))}
    </div>
  );
}

/**
 * ComparisonChart — LineChart overlaying ISA monthly payment vs Loan EMI.
 *
 * Props:
 *   schedule    Array<{ month, isa_payment, loan_emi, cumulative_isa, cumulative_loan }>
 *   height      number  (default 320)
 *   showCumulative  boolean  Toggle between monthly and cumulative view
 */
export default function ComparisonChart({ schedule = [], height = 320, showCumulative = false, cap }) {
  if (!schedule.length) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '0.875rem',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        No data — run a calculation first
      </div>
    );
  }

  const isaKey = showCumulative ? 'cumulative_isa' : 'isa_payment';
  const loanKey = showCumulative ? 'cumulative_loan' : 'loan_emi';
  const isaLabel = showCumulative ? 'Cumulative ISA' : 'ISA Payment';
  const loanLabel = showCumulative ? 'Cumulative Loan' : 'Loan EMI';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={schedule} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="month"
          label={{ value: 'Month', position: 'insideBottomRight', offset: -8, fontSize: 11 }}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <YAxis
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '0.82rem' }} />
        <Line
          type="monotone"
          dataKey={isaKey}
          name={isaLabel}
          stroke="var(--color-chart-isa)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey={loanKey}
          name={loanLabel}
          stroke="var(--color-chart-loan)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {showCumulative && cap != null && (
          <ReferenceLine
            y={cap}
            ifOverflow="extendDomain"
            stroke="var(--color-text-muted)"
            strokeDasharray="4 4"
            label={{ value: 'ISA cap', position: 'insideTopLeft', fill: 'var(--color-text-secondary)' }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
