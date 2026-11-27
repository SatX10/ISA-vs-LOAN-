export default function KpiCard({ label, value, rate, note, badge, tone = 'neutral' }) {
  return (
    <div className="card kpi-card">
      <h3 className="kpi-label">{label}</h3>
      <p className="kpi-value numeric">{value}</p>
      <div className="kpi-meta">
        {rate && <p className="kpi-caption"><strong className="numeric">{rate}</strong> effective annual rate</p>}
        {note && <p className="kpi-caption">{note}</p>}
        {badge && <span className="kpi-badge" data-tone={tone}>{badge}</span>}
      </div>
    </div>
  );
}
