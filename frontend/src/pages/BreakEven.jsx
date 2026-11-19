import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBreakEven } from '../api/client.js';
import { comparisonRequest, formatLakhs } from '../comparison.js';
import { useStore } from '../state/store.js';

const salaryLabel = (salary) => `${salary.toLocaleString('en-IN', { maximumFractionDigits: 4 })} LPA`;

export default function BreakEven() {
  const inputs = useStore((state) => state.inputParams);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getBreakEven(comparisonRequest(inputs), controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [inputs]);

  return (
    <div>
      <header className="page-header">
        <h1>Break-even Salary</h1>
        <p>Find the first starting salary where both options have the same total repayment.</p>
      </header>
      <section className="card reading-width">
        {error && <p className="error-banner" role="alert">{error}</p>}
        {!error && !result && <p role="status">Finding the break-even salary…</p>}
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
        {result?.status === 'threshold_jump' && (
          <>
            <h2 className="section-title">No exact match</h2>
            <p>At about {salaryLabel(result.boundary_lpa)}, the income trigger makes ISA repayment jump above the loan’s {formatLakhs(result.loan_total_paid)} total.</p>
          </>
        )}
        <p className="section-top"><Link to="/">Adjust the contract terms in the calculator</Link></p>
      </section>
    </div>
  );
}
