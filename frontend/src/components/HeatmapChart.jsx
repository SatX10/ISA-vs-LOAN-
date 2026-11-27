import { formatDelta, formatRate } from '../comparison.js';

export default function HeatmapChart({ data, metric }) {
  const { incomes, values, grid, apr_grid: aprGrid, axis } = data;
  const showRate = metric === 'apr';
  const cells = showRate ? aprGrid : grid;
  const maxDifference = cells.reduce(
    (max, row) => row.reduce((rowMax, value) => Math.max(rowMax, Math.abs(value ?? 0)), max),
    0,
  );

  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Sensitivity heatmap">
      <table className="data-table heatmap">
        <thead>
          <tr>
            <th scope="col">Salary (LPA)</th>
            {values.map((value) => (
              <th key={value} scope="col">{axis === 'growth' ? formatRate(value) : `${value}×`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {incomes.map((income, row) => (
            <tr key={income}>
              <th scope="row">{income}</th>
              {values.map((value, column) => {
                const cell = cells[row][column];
                const intensity = 10 + 25 * Math.abs(cell) / (maxDifference || 1);
                return (
                  <td
                    key={value}
                    data-tone={cell ? (showRate ? 'rate' : cell < 0 ? 'lower' : 'higher') : undefined}
                    style={cell ? { '--heatmap-intensity': `${intensity}%` } : undefined}
                  >
                    {showRate ? formatRate(cell) : formatDelta(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
