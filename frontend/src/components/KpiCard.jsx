const badgeStyles = {
  positive: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-success)',
  },
  negative: {
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
  },
  neutral: {
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text-muted)',
  },
};

const styles = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    boxShadow: '0 1px 4px var(--color-shadow)',
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  value: {
    fontSize: '1.6rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    lineHeight: 1.2,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px 7px',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  sub: {
    fontSize: '0.78rem',
    color: 'var(--color-text-muted)',
  },
};

/**
 * KpiCard — compact stat card.
 *
 * Props:
 *   label        string   Short title
 *   value        string   Formatted value
 *   delta        string   Optional delta text (e.g. '+12%', '-₹3,000')
 *   deltaType    'positive' | 'negative' | 'neutral'
 *   sub          string   Optional subtitle / explanation
 */
export default function KpiCard({ label, value, delta, deltaType = 'neutral', sub }) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>{label}</div>
      <div style={styles.valueRow}>
        <span style={styles.value}>{value ?? '—'}</span>
        {delta && (
          <span style={{ ...styles.badge, ...badgeStyles[deltaType] }}>
            {deltaType === 'positive' ? '▲' : deltaType === 'negative' ? '▼' : '●'} {delta}
          </span>
        )}
      </div>
      {sub && <div style={styles.sub}>{sub}</div>}
    </div>
  );
}
