import { useEffect, useState } from 'react';
import { getSensitivity } from '../api/client.js';
import { comparisonRequest } from '../comparison.js';
import HeatmapChart from '../components/HeatmapChart.jsx';
import { useStore } from '../state/store.js';

export default function Sensitivity() {
  const inputParams = useStore((state) => state.inputParams);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [axis, setAxis] = useState('growth');
  const [metric, setMetric] = useState('delta');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getSensitivity(comparisonRequest(inputParams), axis, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [inputParams, axis]);

  return (
    <div>
      <div className="page-header">
        <h1>Sensitivity Analysis</h1>
        <p>Compare starting salaries as you vary salary growth or the ISA repayment cap.</p>
      </div>
      <div className="card button-row section-block">
        <label className="contract-label">
          Compare starting salary with
          <select value={axis} onChange={(event) => setAxis(event.target.value)}>
            <option value="growth">Annual salary growth</option>
            <option value="cap">ISA cap multiplier</option>
          </select>
        </label>
        <label className="contract-label">
          Show
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            <option value="delta">ISA repayment minus loan repayment</option>
            <option value="apr">ISA effective annual rate</option>
          </select>
        </label>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="card">
        <h2 className="section-title">{metric === 'delta' ? 'Repayment Difference' : 'ISA Effective Annual Rate'}</h2>
        <p className="section-block">
          {metric === 'delta'
            ? 'Negative values favor the ISA. Positive values favor the loan.'
            : 'A dash indicates that the model could not calculate a rate for that cell.'}
        </p>
        {loading && <p className="loading-spinner" role="status">Building sensitivity grid…</p>}
        {!loading && !error && data?.axis === axis && <HeatmapChart data={data} metric={metric} />}
      </div>
    </div>
  );
}
