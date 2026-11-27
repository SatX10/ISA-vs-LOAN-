import { useEffect, useState } from 'react';
import { compareContracts, getSaved, deleteContract } from '../api/client.js';
import { formatLakhs, formatRate } from '../comparison.js';
import { useStore } from '../state/store.js';
import { Files, Trash2 } from 'lucide-react';
import LoadingPanel from '../components/LoadingPanel.jsx';
import ResponsiveCell from '../components/ResponsiveCell.jsx';

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

      {error && <p className="error-banner" role="alert">{error}</p>}

      <div className="card">
        <div className="chart-heading">
          <h2 className="section-title" id="saved-records-title">Saved Records</h2>
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
          <LoadingPanel label="Loading saved contracts" />
        ) : contracts.length === 0 ? (
          <div className="saved-empty">
            <Files size={24} strokeWidth={1.75} aria-hidden="true" />
            <p>No saved contracts yet.</p>
            <p>Use the Calculator tab to run and save a comparison.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table" role="table" aria-labelledby="saved-records-title">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Contract</th>
                  <th scope="col" role="columnheader">Saved At</th>
                  <th scope="col" role="columnheader">Principal</th>
                  <th scope="col" role="columnheader">Income (LPA)</th>
                  <th scope="col" role="columnheader">ISA %</th>
                  <th scope="col" role="columnheader">Loan Rate</th>
                  <th scope="col" role="columnheader">ISA Term</th>
                  <th scope="col" role="columnheader">Loan Term</th>
                  <th scope="col" role="columnheader"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {contracts.map((c) => (
                    <tr key={c.id} role="row">
                      <th scope="row" role="rowheader">{c.label}</th>
                      <ResponsiveCell label="Saved at" className="saved-date">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                      </ResponsiveCell>
                      <ResponsiveCell label="Principal">{formatLakhs(c.loan_params.principal)}</ResponsiveCell>
                      <ResponsiveCell label="Income (LPA)">{c.isa_params.starting_income_lpa}</ResponsiveCell>
                      <ResponsiveCell label="ISA share">{c.isa_params.income_share_pct}%</ResponsiveCell>
                      <ResponsiveCell label="Loan rate">{formatRate(c.loan_params.annual_interest_rate)}</ResponsiveCell>
                      <ResponsiveCell label="ISA term">{c.isa_params.term_months} mo</ResponsiveCell>
                      <ResponsiveCell label="Loan term">{c.loan_params.term_months} mo</ResponsiveCell>
                      <ResponsiveCell className="responsive-table-action">
                        <button
                          className="btn btn-secondary table-icon-action"
                          onClick={() => handleDelete(c.id)}
                          disabled={deleting !== null || comparing}
                          aria-label={`Delete ${c.label}`}
                        >
                          {deleting === c.id ? '…' : <Trash2 size={17} strokeWidth={1.75} aria-hidden="true" />}
                        </button>
                      </ResponsiveCell>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ranking.length > 0 && (
        <section className="card section-top" aria-live="polite">
          <h2 className="section-title" id="ranking-title">Repayment at {salary} LPA</h2>
          <div className="table-scroll">
            <table className="data-table responsive-table" role="table" aria-labelledby="ranking-title">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Contract</th>
                  <th scope="col" role="columnheader">ISA repayment</th>
                  <th scope="col" role="columnheader">Loan repayment</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {ranking.map((row) => (
                  <tr key={row.id} role="row">
                    <th scope="row" role="rowheader">{row.label}</th>
                    <ResponsiveCell label="ISA repayment">{formatLakhs(row.isa_total_paid)}</ResponsiveCell>
                    <ResponsiveCell label="Loan repayment">{formatLakhs(row.loan_total_paid)}</ResponsiveCell>
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
