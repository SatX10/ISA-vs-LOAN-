import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../account/AccountProvider.jsx';
import { comparePortfolio } from '../api/client.js';
import { INR } from '../comparison.js';
import AccountWorkspace from '../components/AccountWorkspace.jsx';
import { NegotiationTools } from '../components/DecisionTools.jsx';
import LoadingPanel from '../components/LoadingPanel.jsx';
import { OfferCostChart, OfferStressChart } from '../components/OfferCharts.jsx';
import { PrivateReport, PrivateShareForm, ReportInvite } from '../components/WorkspaceSharing.jsx';
import SavedComparisons, { ReportAssumptions } from '../components/SavedComparisons.jsx';
import WorkspaceTools from '../components/WorkspaceTools.jsx';
import { buildPortfolio, CASES, downloadWorkspaceCsv, newId, PERSPECTIVES, publicReportUrl, readPublicReport, readReportAssumptions, readWorkspace, reportSnapshot, saveWorkspace } from '../offerWorkspace.js';
import { useStore } from '../state/store.js';
import '../theme/workspace.css';

const SETTINGS = [
  ['goal', 'Total education funding (₹)', 1],
  ['grants', 'Grants and scholarships (₹)'],
  ['savings', 'Savings used (₹)'],
  ['family', 'Family contribution (₹)'],
  ['budget', 'Monthly repayment budget (₹)'],
  ['takeHome', 'Monthly take-home pay (₹)'],
  ['essentials', 'Monthly essentials (₹)'],
  ['otherDebt', 'Other monthly debt payments (₹)'],
  ['lower', 'Lower salary (LPA)', 0, 10000],
  ['expected', 'Expected salary (LPA)', 0, 10000],
  ['higher', 'Higher salary (LPA)', 0, 10000],
  ['delay', 'Extra months before the first job', 0, 120, 1],
  ['rateShock', 'Loan rate increase (percentage points)', 0, 60],
  ['fxShock', 'Foreign currency cost increase (%)', 0, 60],
];

function OfferTable({ rows }) {
  const showBudget = rows.some(({ months }) => months != null);
  return (
    <div className="table-scroll offer-table" role="region" aria-label="Offer comparison table" tabIndex={0}>
      <table className="data-table">
        <thead><tr><th scope="col">Offer</th><th scope="col">Total repayment</th><th scope="col">Peak month</th>
          <th scope="col">Upfront cash</th><th scope="col">Net funding</th><th scope="col">Gap or surplus</th>
          {showBudget && <th scope="col">Months over budget</th>}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={row.id ?? index}>
            <th scope="row">{row.label}<small>{{ isa: 'ISA', loan: 'Loan', bundle: 'Combined offers' }[row.kind]}
              {row.version && ` · Version ${row.version}`}{row.quote_date && ` · Quoted ${row.quote_date}`}</small>
              {row.terms && <small>{row.terms.duration_months} months
                {row.kind === 'isa' ? ` · ${row.terms.share_percent}% share · ${row.terms.cap_multiple}× cap` : ` · ${row.terms.rate_percent}% annual rate`}
                {row.terms.grace_months > 0 && ` · ${row.terms.grace_months} months of grace`}
                {row.terms.monthly_fee_inr > 0 && ` · ${INR.format(row.terms.monthly_fee_inr)} recurring fee`}</small>}
            </th>
            <td>{INR.format(row.total)}</td><td>{INR.format(row.peak)}</td><td>{INR.format(row.upfront)}</td>
            <td>{INR.format(row.funded_inr)}</td>
            <td>{row.remaining_gap_inr > 0 ? `${INR.format(row.remaining_gap_inr)} gap`
              : row.extra_funding_inr > 0 ? `${INR.format(row.extra_funding_inr)} extra` : 'Fully funded'}</td>
            {showBudget && <td>{row.months ?? '—'}</td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function PublicReport({ snapshot, scenario, assumptions }) {
  const rows = readPublicReport(snapshot);
  const caseName = Object.hasOwn(CASES, scenario) ? CASES[scenario] : CASES.expected;
  return (
    <div>
      <header className="page-header">
        <h1>Shared offer comparison</h1>
        <p>Projected repayments for the {caseName.toLowerCase()} scenario.</p>
      </header>
      {rows ? (
        <section className="card">
          <OfferTable rows={rows} />
          <ReportAssumptions assumptions={assumptions} />
          <button type="button" className="btn btn-secondary section-top no-print" onClick={() => window.print()}>Print report</button>
        </section>
      ) : <p className="error-banner" role="alert">This comparison link is incomplete or invalid.</p>}
      <p className="section-top"><Link to="/workspace">Open your own workspace</Link></p>
    </div>
  );
}

function downloadReport({ rows, scenario, assumptions }) {
  downloadWorkspaceCsv('isa-truth-offers.csv', [
    ['Scenario', 'Offer', 'Type', 'Quote date', 'Version', 'Total repayment INR', 'Peak monthly INR', 'Upfront INR', 'Net funding INR', 'Funding gap INR',
      'Extra job delay months', 'Rate increase percentage points', 'FX increase percent'],
    ...rows.map((row) => [CASES[scenario], row.label, row.kind, row.quote_date, row.version, row.total, row.peak, row.upfront, row.funded_inr,
      row.remaining_gap_inr, assumptions.delay_months, assumptions.rate_increase_percent, assumptions.fx_increase_percent]),
  ]);
}

function lensScenario(report, lens) {
  const scenario = PERSPECTIVES[lens][2];
  return report?.offers.some((offer) => offer.cases[scenario]) ? scenario : 'expected';
}

function EditableWorkspace({ initialWorkspace, onWorkspaceChange = saveWorkspace, onReportShared, syncLedger = false }) {
  const { profile } = useAccount();
  const inputs = useStore((state) => state.inputParams);
  const setParams = useStore((state) => state.setParams);
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(() => initialWorkspace ?? readWorkspace());
  const [settings, setSettings] = useState(() => ({
    goal: inputs.loan_amount, grants: 0, savings: 0, family: 0, budget: inputs.budget_inr ?? '',
    takeHome: inputs.take_home_inr ?? '', essentials: inputs.essentials_inr ?? '', otherDebt: inputs.other_debt_inr ?? '',
    expected: inputs.annual_income_lpa, lower: Math.round(inputs.annual_income_lpa * 75) / 100,
    higher: Math.min(10000, Math.round(inputs.annual_income_lpa * 125) / 100), delay: 6, rateShock: 2, fxShock: 10,
    ...workspace.settings,
  }));
  const [offerKind, setOfferKind] = useState('loan');
  const [bundleIds, setBundleIds] = useState(() => (workspace.bundleIds ?? [])
    .filter((id) => workspace.offers.some((offer) => offer.id === id)));
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [fundingDate, setFundingDate] = useState(null);
  const [note, setNote] = useState('');
  const [editOfferId, setEditOfferId] = useState(null);
  const [perspective, setPerspective] = useState('student');
  const [report, setReport] = useState(null);
  const [scenario, setScenario] = useState('expected');
  const [featuredId, setFeaturedId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [printCopy, setPrintCopy] = useState(null);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState('');
  const [requestError, setRequestError] = useState('');
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  function persist(next) {
    setWorkspace(next);
    try {
      onWorkspaceChange(next);
      setWarning('');
    } catch {
      setWarning('This browser could not save the workspace. Your changes are available until this page closes.');
    }
  }

  function invalidate() {
    requestRef.current?.abort();
    requestRef.current = null;
    setReport(null);
    setShareOpen(false);
    setPending(false);
    setRequestError('');
  }

  function clearOffer() {
    setEditOfferId(null);
    setLabel('');
    setDate('');
    setFundingDate(null);
    setNote('');
  }

  function captureOffer(event) {
    event.preventDefault();
    const name = label.trim();
    if (!name) return;
    const offers = editOfferId
      ? workspace.offers.map((offer) => offer.id === editOfferId ? { ...offer, label: name, date, note,
        inputs: { ...offer.inputs, funding_date: fundingDate ?? offer.inputs.funding_date ?? '' } } : offer)
      : [...workspace.offers, { id: newId(), kind: offerKind, label: name, date, note,
        inputs: { ...inputs, funding_date: fundingDate ?? inputs.funding_date ?? '' }, version: 1 }];
    invalidate();
    persist({ ...workspace, offers });
    clearOffer();
  }

  function duplicateOffer(offer, useCurrent) {
    if (workspace.offers.length >= 12) return;
    const version = Math.max(...workspace.offers.filter((entry) => (entry.original ?? entry.id) === (offer.original ?? offer.id))
      .map((entry) => entry.version)) + 1;
    const next = {
      ...offer, id: newId(), original: offer.original ?? offer.id, version,
      label: `${offer.label.slice(0, 103)} (v${version})`, inputs: useCurrent ? { ...inputs } : offer.inputs,
      date: useCurrent ? '' : offer.date, statement_balance_inr: null, statement_date: '',
    };
    invalidate();
    persist({ ...workspace, offers: [...workspace.offers, next] });
  }

  async function run(event) {
    event.preventDefault();
    if (pending) return;
    invalidate();
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    try {
      const data = await comparePortfolio(buildPortfolio(settings, workspace.offers, bundleIds), controller.signal);
      if (controller.signal.aborted) return;
      setReport(data);
      setScenario(lensScenario(data, perspective));
      if (!workspace.settings) persist({ ...workspace, settings, bundleIds });
    } catch (error) {
      if (!controller.signal.aborted) setRequestError(error.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  }

  const rows = report?.offers.filter((offer) => offer.cases[scenario]).map((offer) => ({
    ...offer, total: offer.cases[scenario].total_inr, peak: offer.cases[scenario].peak_inr,
    upfront: offer.cases[scenario].upfront_inr, months: offer.cases[scenario].months_over_budget,
    quote_date: workspace.offers.find(({ id }) => id === offer.id)?.date,
    version: workspace.offers.find(({ id }) => id === offer.id)?.version,
  })) ?? [];
  const featured = report?.offers.find((offer) => offer.id === featuredId) ?? report?.offers[0];
  const comparisonOffer = featured && report.offers
    .filter((offer) => offer.id !== featured.id && offer.funded_inr === featured.funded_inr)
    .sort((a, b) => a.cases.expected.total_inr - b.cases.expected.total_inr)[0];
  const featuredSaved = workspace.offers.find(({ id }) => id === featured?.id);
  const publicSnapshot = report && reportSnapshot(report, scenario, workspace.offers, settings);
  const privateSnapshot = report && reportSnapshot(report, scenario, workspace.offers, settings, { salary: true, budget: true, terms: true });
  const printable = printCopy ?? (publicSnapshot && { snapshot: publicSnapshot, title: 'Offer comparison' });

  function printReport(snapshot, title) {
    const { salary_lpa: _salary, budget_inr: _budget, ...assumptions } = snapshot.assumptions ?? {};
    flushSync(() => setPrintCopy({ snapshot: { ...snapshot, assumptions }, title }));
    window.addEventListener('afterprint', () => setPrintCopy(null), { once: true });
    window.print();
  }

  return (
    <>
      {printable && <section className="print-only" aria-label="Redacted offer comparison">
        <h1>{printable.title}</h1><p>{CASES[printable.snapshot.scenario]}</p>
        <OfferTable rows={printable.snapshot.rows} />
        <ReportAssumptions assumptions={printable.snapshot.assumptions} />
      </section>}
      <div className="offer-workspace no-print">
      {warning && <p className="workspace-message" role="status">{warning}</p>}
      <div className="workspace-columns no-print">
        <section className="card">
          <h2 className="section-title">Saved offers</h2>
          <p className="section-block">Set terms in the <Link to="/calculator">Calculator</Link> or bring in a lender quote from the <Link to="/planner">Planner</Link>. Save either option here to compare it with others.</p>
          <form className="workspace-form" onSubmit={captureOffer}>
            {!editOfferId && <label className="workspace-field"><span>Option to save</span>
              <select value={offerKind} onChange={(event) => setOfferKind(event.target.value)}>
                <option value="loan">Current loan</option><option value="isa">Current ISA</option>
              </select>
            </label>}
            <label className="workspace-field"><span>Offer name</span>
              <input maxLength={120} required value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <div className="planner-field-grid">
              <label className="workspace-field"><span>Quote date</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="workspace-field"><span>Offer notes</span>
                <input maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              {(editOfferId ? workspace.offers.find(({ id }) => id === editOfferId)?.kind : offerKind) === 'loan'
                && <label className="workspace-field"><span>Funding date for scheduled payments</span>
                  <input type="date" min="1900-01-01" max="2100-12-31" value={fundingDate ?? inputs.funding_date ?? ''}
                    onChange={(event) => setFundingDate(event.target.value)} />
                  <small>Month 1 is one month after this date. Use the written repayment calendar to verify due dates.</small>
                </label>}
            </div>
            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={!editOfferId && workspace.offers.length >= 12}>
                {editOfferId ? 'Save offer details' : 'Save current offer'}
              </button>
              {editOfferId && <button type="button" className="btn btn-secondary" onClick={clearOffer}>Cancel edit</button>}
            </div>
          </form>
          {workspace.offers.length === 0 && <p className="workspace-meta section-top">Offers you save will appear here.</p>}
          <ul className="saved-offer-list">
            {workspace.offers.map((offer) => (
              <li key={offer.id}>
                <h3>{offer.label}</h3>
                <p className="workspace-meta">{offer.kind === 'isa' ? 'ISA' : 'Loan'} · Version {offer.version} · {INR.format(offer.inputs.loan_amount)}
                  {offer.date && ` · ${offer.date}`}</p>
                {offer.note && <p className="workspace-meta">{offer.note}</p>}
                <details className="saved-offer-actions">
                  <summary>Manage offer</summary>
                  <div className="button-row">
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      setParams(offer.inputs, true);
                      navigate('/calculator');
                    }}>Load terms</button>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      setEditOfferId(offer.id); setLabel(offer.label); setDate(offer.date); setNote(offer.note); setFundingDate(offer.inputs.funding_date ?? '');
                    }}>Edit details</button>
                    <button type="button" className="btn btn-secondary" disabled={workspace.offers.length >= 12}
                      onClick={() => duplicateOffer(offer, false)}>Duplicate</button>
                    <button type="button" className="btn btn-secondary" disabled={workspace.offers.length >= 12}
                      onClick={() => duplicateOffer(offer, true)}>Save new version from Calculator</button>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      if (!window.confirm(`Remove ${offer.label} from the workspace? Linked account payments stay in the spending ledger.`)) return;
                      invalidate();
                      const remainingBundle = bundleIds.filter((id) => id !== offer.id);
                      setBundleIds(remainingBundle);
                      persist({ ...workspace, offers: workspace.offers.filter((item) => item.id !== offer.id),
                        payments: workspace.payments.filter((payment) => payment.offerId !== offer.id), bundleIds: remainingBundle });
                      if (editOfferId === offer.id) clearOffer();
                    }}>Remove</button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="section-title">Funding goal and scenarios</h2>
          <form className="workspace-form" onSubmit={run}>
            <div className="planner-field-grid">
              {SETTINGS.map(([id, text, min = 0, max = 1_000_000_000, step = 'any']) => (
                <label key={id} className="workspace-field"><span>{text}</span>
                  <input type="number" min={min} max={max} step={step} value={settings[id]}
                    required={['goal', 'lower', 'expected', 'higher'].includes(id)}
                    onChange={(event) => {
                      invalidate();
                      const next = { ...settings, [id]: event.target.value };
                      setSettings(next);
                      persist({ ...workspace, settings: next });
                    }} />
                </label>
              ))}
            </div>
            <label className="workspace-field"><span>Decision perspective</span>
              <select value={perspective} onChange={(event) => {
                setPerspective(event.target.value);
                setScenario(lensScenario(report, event.target.value));
              }}>
                {Object.entries(PERSPECTIVES).map(([key, [name]]) => <option key={key} value={key}>{name}</option>)}
              </select><small>{PERSPECTIVES[perspective][1]}</small>
            </label>
            {workspace.offers.length >= 2 && (
              <details className="calculator-term-group">
                <summary>Combine two to four offers</summary>
                <div className="calculator-fields">
                  <small>Combined financing uses the expected scenario and adds the selected monthly schedules.</small>
                  {workspace.offers.map((offer) => (
                    <label className="planner-ai-control" key={offer.id}>
                      <input type="checkbox" checked={bundleIds.includes(offer.id)} disabled={bundleIds.length === 4 && !bundleIds.includes(offer.id)}
                        onChange={(event) => {
                          invalidate();
                          const next = event.target.checked ? [...bundleIds, offer.id] : bundleIds.filter((id) => id !== offer.id);
                          setBundleIds(next);
                          persist({ ...workspace, bundleIds: next });
                        }} />{offer.label}
                    </label>
                  ))}
                  {bundleIds.length === 1 && <small>Choose at least one more offer to compare a bundle.</small>}
                </div>
              </details>
            )}
            <button type="submit" className="btn btn-primary" disabled={!workspace.offers.length || pending || bundleIds.length === 1}>
              {pending ? 'Comparing…' : 'Compare saved offers'}
            </button>
            {requestError && <p className="workspace-message" role="alert">{requestError}</p>}
          </form>
        </section>
      </div>
      {report && (
        <>
          <section className="card" aria-label="Offer results">
            <h2 className="section-title">Offer comparison</h2>
            <p className="section-block">{INR.format(report.funding_needed_inr)} in financing needed after {INR.format(report.cash_inr)} in other funding.</p>
            <label className="workspace-field section-block"><span>Scenario</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
                {Object.entries(CASES).filter(([key]) => report.offers.some((offer) => offer.cases[key]))
                  .map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </label>
            <OfferTable rows={rows} />
            <div className="button-row section-top no-print">
              <button type="button" className="btn btn-secondary" onClick={() => downloadReport(publicSnapshot)}>Download CSV</button>
              <button type="button" className="btn btn-secondary" onClick={() => printReport(publicSnapshot, 'Offer comparison')}>Print redacted report</button>
              <button type="button" className="btn btn-secondary" aria-expanded={shareOpen} onClick={() => setShareOpen(!shareOpen)}>Share read-only report</button>
            </div>
            {shareOpen && <label className="workspace-field section-top no-print"><span>Read-only report link</span>
              <input readOnly value={publicReportUrl(publicSnapshot)} onFocus={(event) => event.target.select()} />
              <small>Anyone with this link can see the offer names and the selected scenario’s payment totals. Salary and budget inputs are omitted.</small>
            </label>}
            {profile && <PrivateShareForm key={scenario} snapshot={publicSnapshot} privateSnapshot={privateSnapshot} onShared={onReportShared} />}
          </section>
          <div className="workspace-columns">
            <OfferCostChart offers={report.offers} scenario={scenario} />
            {featured && <OfferStressChart offer={featured} />}
          </div>
          <label className="workspace-field card no-print"><span>Offer shown in scenario chart and payment tools</span>
            <select value={featured?.id ?? ''} onChange={(event) => setFeaturedId(event.target.value)}>
              {report.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.label}</option>)}
            </select>
          </label>
          {featuredSaved && <NegotiationTools key={featuredSaved.id} offer={featuredSaved} benchmark={comparisonOffer} salary={settings.expected} />}
        </>
      )}
      <SavedComparisons comparisons={workspace.comparisons ?? []} current={privateSnapshot} Table={OfferTable} onPrint={printReport}
        onChange={(comparisons) => persist({ ...workspace, comparisons })} />
      <WorkspaceTools featured={featuredSaved ? featured : null} savedOffer={featuredSaved} syncLedger={syncLedger} payments={workspace.payments}
        onStatement={(fields) => persist({ ...workspace, offers: workspace.offers.map((offer) => offer.id === featuredSaved.id ? { ...offer, ...fields } : offer) })}
        onPayments={(payments) => persist({ ...workspace, payments })}
        fundingGoal={Math.max(0, Number(settings.goal) - Number(settings.grants))} />
      </div>
    </>
  );
}

export default function Workspace() {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const { profile, status, retry } = useAccount();
  const invite = hash.match(/^#invite=([A-Za-z0-9_-]{32})$/)?.[1];
  if (invite) return <ReportInvite code={invite} />;
  if (params.has('snapshot')) return <PublicReport snapshot={params.get('snapshot')} scenario={params.get('scenario')}
    assumptions={readReportAssumptions(params.get('assumptions'))} />;
  const privateReport = params.get('report');
  if (privateReport) return <PrivateReport key={`${profile?.email ?? 'guest'}:${privateReport}`} id={privateReport} Table={OfferTable} />;
  const explicitMode = params.get('storage');
  const accountMode = Boolean(profile && explicitMode !== 'browser');
  return (
    <div className="offer-workspace">
      <header className="page-header no-print">
        <h1>Offer workspace</h1>
        <p>Save loan and ISA offers, compare them under the same assumptions, and track what you repay.</p>
      </header>
      {profile && <nav className="button-row no-print" aria-label="Workspace storage">
        <Link className={`btn ${accountMode ? 'btn-primary' : 'btn-secondary'}`}
          aria-current={accountMode ? 'page' : undefined} to="/workspace?storage=account">Account workspace</Link>
        <Link className={`btn ${accountMode ? 'btn-secondary' : 'btn-primary'}`}
          aria-current={accountMode ? undefined : 'page'} to="/workspace?storage=browser">This browser</Link>
      </nav>}
      {status === 'ready' && !profile && <p className="workspace-message no-print">
        Offers are saved in this browser. <Link to="/sign-in" state={{ returnTo: '/workspace' }}>Sign in</Link> to sync across devices or share a private report.
      </p>}
      {status === 'error' && <div className="button-row no-print">
        <p className="workspace-meta">Account access could not be checked. You can use this browser’s workspace.</p>
        <button className="btn btn-secondary" type="button" onClick={retry}>Retry account check</button>
      </div>}
      {status === 'loading' && explicitMode !== 'browser'
        ? <LoadingPanel label="Checking account" />
        : accountMode ? <AccountWorkspace key={profile.email} Editor={EditableWorkspace} /> : <EditableWorkspace />}
    </div>
  );
}
