import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getBreakEven } from '../api/client.js';
import { comparisonRequest, formatLakhs } from '../comparison.js';
import { useStore } from '../state/store.js';
import LoadingPanel from '../components/LoadingPanel.jsx';
import { SalaryCostChart } from '../components/FinancingCharts.jsx';

const salaryLabel = (salary) => `${salary.toLocaleString('en-IN', { maximumFractionDigits: 4 })} LPA`;

export default function BreakEven() {
  const { state } = useLocation();
  const plannerTerms = state?.comparisonTerms;
  const inputs = useStore((store) => plannerTerms ?? (store.results ? store.inputParams : null));
  const [response, setResponse] = useState(null);

  useEffect(() => {
    if (!inputs) return undefined;
    const controller = new AbortController();
    getBreakEven(comparisonRequest(inputs), controller.signal)
      .then((result) => { if (!controller.signal.aborted) setResponse({ inputs, result }); })
      .catch((error) => { if (!controller.signal.aborted) setResponse({ inputs, error: error.message }); });
    return () => controller.abort();
  }, [inputs]);

  const heading = (
    <header className="page-header">
      <h1>Break-even Salary</h1>
      <p>Find the first starting salary where both options have the same total repayment.</p>
    </header>
  );
  if (!inputs) {
    return (
      <div>
        {heading}
        <section className="card reading-width">
          <h2 className="section-title">Start with a comparison</h2>
          <p>Enter your offer terms in Calculator and select Calculate to find the break-even salary.</p>
          <Link className="btn btn-secondary section-top" to="/calculator">Open Calculator</Link>
        </section>
      </div>
    );
  }

  const { result, error } = response?.inputs === inputs ? response : {};
  return (
    <div>
      {heading}
      <section className="card reading-width">
        {error && <p className="error-banner" role="alert">{error}</p>}
        {!error && !result && (
          <LoadingPanel label="Finding the break-even salary">
            <div className="skeleton skeleton-kpi-value" />
            <div className="skeleton skeleton-line-short" />
          </LoadingPanel>
        )}
        {result?.status === 'match' && (
          <>
            <h2 className="break-even-value">{salaryLabel(result.salary_lpa)}</h2>
            <p>Both options cost approximately {formatLakhs(result.loan_total_paid)} at this starting salary.</p>
          </>
        )}
        {result?.status === 'isa_cheaper_throughout' && (
          <>
            <h2 className="section-title">ISA costs less across the modeled range</h2>
            <p>No match between ₹0 and {salaryLabel(result.upper_income_lpa)}. Loan repayment is {formatLakhs(result.loan_total_paid)}.</p>
          </>
        )}
        {result?.status === 'loan_cheaper_throughout' && (
          <>
            <h2 className="section-title">Loan costs less across the modeled range</h2>
            <p>The loan costs {formatLakhs(result.loan_total_paid)}. With your current income overrides, the ISA costs more throughout the tested salary range.</p>
          </>
        )}
        {result?.status === 'threshold_jump' && (
          <>
            <h2 className="section-title">No exact match</h2>
            <p>At about {salaryLabel(result.boundary_lpa)}, the income trigger makes ISA repayment jump above the loan’s {formatLakhs(result.loan_total_paid)} total.</p>
          </>
        )}
        {result?.status === 'salary_ranges' && (
          <>
            <h2 className="section-title">Which option costs less by salary range</h2>
            <p className="section-block">Counting only paying months can change which option costs less more than once. Values near a boundary depend on the exact income entered.</p>
            <table className="data-table">
              <thead><tr><th scope="col">Starting salary</th><th scope="col">Lower repayment</th></tr></thead>
              <tbody>{result.regions.map(({ from_lpa: from, to_lpa: to, winner }) =>
                <tr key={from}><th scope="row">{salaryLabel(from)} to {salaryLabel(to)}</th><td>{winner}</td></tr>)}</tbody>
            </table>
          </>
        )}
        <p className="section-top">{plannerTerms ? <Link to="/planner">Back to AI Planner</Link>
          : <Link to="/calculator">Adjust the contract terms in the calculator</Link>}</p>
      </section>
      {result && <SalaryCostChart curve={result.curve} boundary={result.salary_lpa ?? result.boundary_lpa} />}
    </div>
  );
}
