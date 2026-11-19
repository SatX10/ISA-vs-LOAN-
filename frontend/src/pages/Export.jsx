import { useState } from 'react';
import { useStore } from '../state/store.js';
import { exportCsv } from '../api/client.js';
import { INR, comparisonRequest, comparisonSchedule, formatDelta, formatLakhs, formatRate } from '../comparison.js';

export default function Export() {
  const { inputParams, results } = useStore();
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDlError(null);
    try {
      const blob = await exportCsv(comparisonRequest(inputParams));
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `isa-vs-loan-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      setDlError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  const schedule = comparisonSchedule(results);

  return (
    <div>
      <div className="page-header">
        <h1>Export</h1>
        <p>Download or print a month-by-month report using the current calculator inputs.</p>
      </div>

      {dlError && <div className="error-banner">⚠️ {dlError}</div>}

      <div className="card section-block no-print">
        <h2 className="section-title">Download</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          The export uses the current calculator inputs. Amounts in the CSV are in lakhs of rupees.
        </p>
        <div className="button-row">
          <button className="btn btn-primary" onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Preparing…' : 'Download CSV'}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()} disabled={!results}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      {results && (
        <section className="card section-block">
          <h2 className="section-title">Comparison Summary</h2>
          <p>Principal {formatLakhs(results.loan.principal)} · Starting salary {inputParams.annual_income_lpa} LPA</p>
          <p>ISA {formatLakhs(results.isa.total_paid)} · Loan {formatLakhs(results.loan.total_paid)} · ISA minus loan {formatDelta(results.summary.delta)}</p>
          <p>Effective annual rates · ISA {formatRate(results.isa.effective_annual_rate)} · Loan {formatRate(results.loan.effective_annual_rate)}</p>
        </section>
      )}

      {/* Preview table */}
      <div className="card">
        <h2 className="section-title">Schedule Preview</h2>
        {schedule.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No data yet — go to the Calculator tab, set your inputs and press Calculate.
          </p>
        ) : (
          <div className="report-schedule">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>ISA Payment</th>
                  <th>Cumulative ISA</th>
                  <th>Loan EMI</th>
                  <th>Cumulative Loan</th>
                  <th>Loan Balance</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{INR.format(row.isa_payment ?? 0)}</td>
                    <td>{INR.format(row.cumulative_isa ?? 0)}</td>
                    <td>{INR.format(row.loan_emi ?? 0)}</td>
                    <td>{INR.format(row.cumulative_loan ?? 0)}</td>
                    <td>{INR.format(row.loan_balance ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
