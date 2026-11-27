export default function ChartTooltip({ active, payload, label, formatValue, formatLabel }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{formatLabel ? formatLabel(label) : label}</p>
      <ul>
        {payload.map(({ dataKey, name, value, color }) => (
          <li key={dataKey ?? name}>
            <span className="chart-tooltip-series">
              <span className="chart-tooltip-dot" style={{ '--series-color': color }} aria-hidden="true" />
              {name}
            </span>
            <span className="numeric">{formatValue(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
