import { useEffect, useState } from 'react';
import { compareContracts, getSaved, deleteContract } from '../api/client.js';
import { formatLakhs, formatRate } from '../comparison.js';
import { useStore } from '../state/store.js';

export default function Saved() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [comparing, setComparing] = useState(false);
  const salary = useStore((state) => state.inputParams.annual_income_lpa);

  const fetchList = () => {
    setLoading(true);
    setError(null);
    setRanking([]);
    getSaved()
      .then(setContracts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchList(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this saved contract?')) return;
    setError(null);
    setDeleting(id);
    try {
      await deleteContract(id);
      setContracts((prev) => prev.filter((c) => c.id !== id));
      setRanking((prev) => prev.filter((row) => row.id !== id));
    } catch (e) {
      setError(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleCompare = async () => {
    setError(null);
    setComparing(true);
    try {
      const results = await compareContracts(contracts, salary);
      const ranked = results.map((result, index) => ({
        ...result, id: contracts[index].id, label: contracts[index].label,
      }));
      ranked.sort((a, b) => a.isa_total_paid - b.isa_total_paid);
      setRanking(ranked);
    } catch (err) {
      setError(err.message);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Compare Contracts</h1>
        <p>Review saved terms and rank their ISA costs at a common starting salary.</p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Saved Records</h2>
          <div className="button-row">
            <button className="btn btn-secondary" onClick={fetchList} disabled={loading || deleting !== null || comparing}>
              Refresh
            </button>
            <button className="btn btn-primary" onClick={handleCompare}
              disabled={contracts.length < 2 || loading || comparing || deleting !== null}>
              {comparing ? 'Comparing…' : 'Rank by ISA cost'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-spinner">⏳ Loading saved contracts…</div>
        ) : contracts.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</p>
            <p>No saved contracts yet.</p>
            <p>Use the Calculator tab to run and save a comparison.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Saved At</th>
                  <th>Principal</th>
                  <th>Income (LPA)</th>
                  <th>ISA %</th>
                  <th>Loan Rate</th>
                  <th>ISA Term</th>
                  <th>Loan Term</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">{c.label}</th>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                      </td>
                      <td>{formatLakhs(c.loan_params.principal)}</td>
                      <td>{c.isa_params.starting_income_lpa}</td>
                      <td>{c.isa_params.income_share_pct}%</td>
                      <td>{formatRate(c.loan_params.annual_interest_rate)}</td>
                      <td>{c.isa_params.term_months} mo</td>
                      <td>{c.loan_params.term_months} mo</td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={() => handleDelete(c.id)}
                          disabled={deleting !== null || comparing}
                          aria-label={`Delete ${c.label}`}
                        >
                          {deleting === c.id ? '…' : '🗑️'}
                        </button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ranking.length > 0 && (
        <section className="card section-top" aria-live="polite">
          <h2 className="section-title">Repayment at {salary} LPA</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Contract</th><th>ISA repayment</th><th>Loan repayment</th></tr></thead>
              <tbody>
                {ranking.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    <td>{formatLakhs(row.isa_total_paid)}</td>
                    <td>{formatLakhs(row.loan_total_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
