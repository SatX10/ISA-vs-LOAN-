import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountProvider.jsx';
import {
  acceptReportInvite, createReportInvite, createReviewerCode, deleteWorkspaceReport, getReportInvites, getWorkspaceReport,
  getWorkspaceReports, revokeReportInvite, shareWorkspaceReport,
} from '../api/plannerClient.js';
import { CASES } from '../offerWorkspace.js';
import LoadingPanel from './LoadingPanel.jsx';
import { ReportAssumptions } from './SavedComparisons.jsx';

export function PrivateShareForm({ snapshot, privateSnapshot, onShared }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [salary, setSalary] = useState(false);
  const [budget, setBudget] = useState(false);
  const [terms, setTerms] = useState(false);
  const [method, setMethod] = useState('invite');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(null);

  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    setInvite(null);
    try {
      const assumptions = { ...snapshot.assumptions,
        ...(salary && { salary_lpa: privateSnapshot.assumptions.salary_lpa }),
        ...(budget && { budget_inr: privateSnapshot.assumptions.budget_inr }),
      };
      const selected = { ...snapshot, assumptions, rows: terms ? privateSnapshot.rows : snapshot.rows };
      if (method === 'invite') setInvite(await createReportInvite({ email: email.trim(), snapshot: selected }));
      else {
        setResult(await shareWorkspaceReport({ code: code.trim(), snapshot: selected }));
        setCode('');
      }
      onShared?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="workspace-tools section-top no-print">
      <summary>Share privately with a reviewer</summary>
      <form className="workspace-form" onSubmit={send}>
        <p>Invite a parent or counselor to view the {CASES[snapshot.scenario].toLowerCase()} comparison in their account.</p>
        <p className="workspace-meta">Share offer names, quote dates, and projected totals. Salary and budget are off by default. Notes and actual payments stay in your workspace.</p>
        <label className="planner-ai-control"><input type="checkbox" checked={salary} onChange={(event) => setSalary(event.target.checked)} />Include scenario salary</label>
        {privateSnapshot.assumptions.budget_inr != null && <label className="planner-ai-control"><input type="checkbox" checked={budget}
          onChange={(event) => setBudget(event.target.checked)} />Include monthly repayment budget</label>}
        <label className="planner-ai-control"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />Include key contract terms</label>
        <label className="workspace-field"><span>Sharing method</span><select value={method} onChange={(event) => {
          setMethod(event.target.value); setInvite(null); setResult(null); setError('');
        }}><option value="invite">Invite link for an email address</option><option value="code">One-time code from the reviewer</option></select></label>
        {method === 'invite' ? <label className="workspace-field"><span>Reviewer email</span>
          <input required type="email" maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          : <label className="workspace-field"><span>Reviewer code</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} required
              maxLength={24} pattern="[A-Za-z0-9_\-]{24}" autoComplete="off" spellCheck={false} /></label>}
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Preparing…' : method === 'invite' ? 'Create read-only invite' : 'Send private report'}</button></div>
        {invite && <div role="status"><label className="workspace-field"><span>One-time invite link</span>
          <input value={new URL(`/workspace#invite=${invite.code}`, window.location.origin).href} readOnly onFocus={(event) => event.target.select()} /></label>
          <p>Send this link to your reviewer. It expires {new Date(invite.expires_at * 1000).toLocaleString()}.</p></div>}
        {result && <p className="workspace-message" role="status">Report sent. <Link to={`/workspace?report=${result.id}`}>View the shared copy</Link></p>}
        {error && <p className="workspace-message" role="alert">{error}</p>}
      </form>
    </details>
  );
}

export function ReportCenter({ refresh }) {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState(null);
  const [invites, setInvites] = useState([]);
  const [code, setCode] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const codeInput = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    Promise.all([getWorkspaceReports(controller.signal), getReportInvites(controller.signal)]).then(([data, pending]) => {
      if (!controller.signal.aborted) { setReports(data); setInvites(pending); }
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [attempt, open, refresh]);

  async function generate() {
    setBusy(true);
    setError('');
    setCopyStatus('');
    try {
      setCode(await createReviewerCode());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopyStatus('Code copied.');
    } catch {
      codeInput.current?.focus();
      codeInput.current?.select();
      setCopyStatus('Code selected. Use your browser’s copy command.');
    }
  }

  async function remove(id, sent) {
    if (!window.confirm(sent ? 'Revoke this reviewer’s access to the report?' : 'Decline this report? It will be removed from both accounts.')) return;
    setBusy(true);
    setError('');
    try {
      await deleteWorkspaceReport(id);
      setReports((current) => ({
        received: current.received.filter((row) => row.id !== id),
        sent: current.sent.filter((row) => row.id !== id),
      }));
      setAttempt((count) => count + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this pending invite?')) return;
    setBusy(true); setError('');
    try { await revokeReportInvite(id); setInvites((current) => current.filter((invite) => invite.id !== id)); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return (
    <details className="card workspace-tools no-print" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Private reports</summary>
      <p>Generate a one-time code to receive a report. Give it to the person sending it within 30 minutes.</p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={generate}>
          {code ? 'Generate a new reviewer code' : 'Generate reviewer code'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => {
          setError('');
          setAttempt((count) => count + 1);
        }}>Refresh reports</button>
      </div>
      {code && <div className="workspace-form">
        <label className="workspace-field"><span>Your reviewer code</span>
          <input value={code.code} readOnly ref={codeInput} onFocus={(event) => event.target.select()} />
          <small>Expires {new Date(code.expires_at * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. A new code replaces the current one.</small>
        </label>
        <div><button type="button" className="btn btn-secondary" onClick={copyCode}>Copy code</button></div>
        {copyStatus && <p role="status">{copyStatus}</p>}
      </div>}
      {error && <p className="workspace-message" role="alert">{error}</p>}
      {open && !reports && !error && <LoadingPanel label="Loading private reports" />}
      {invites.length > 0 && <section aria-label="Pending invites"><h3>Pending invites</h3>
        <ul className="saved-offer-list">{invites.map(({ id, recipient_email: email, expires_at: expires }) => <li key={id}>
          <p>{email}</p><p className="workspace-meta">Expires {new Date(expires * 1000).toLocaleString()}</p>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => revoke(id)}>Revoke invite</button>
        </li>)}</ul></section>}
      {reports && <div className="workspace-columns">
        {[[false, 'Received reports', reports.received], [true, 'Sent reports', reports.sent]].map(([sent, title, entries]) => (
          <section key={title} aria-label={title}>
            <h3>{title}</h3>
            {!entries.length && <p className="workspace-meta">No {sent ? 'sent' : 'received'} reports yet.</p>}
            <ul className="saved-offer-list workspace-report-list">
              {entries.map(({ id, person, scenario, created_at }) => <li key={id}>
                <p><Link to={`/workspace?report=${id}`}>{CASES[scenario]}</Link> {sent ? 'to' : 'from'} {person}</p>
                <p className="workspace-meta">{new Date(created_at * 1000).toLocaleString()}</p>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => remove(id, sent)}>
                  {sent ? 'Revoke access' : 'Decline report'}
                </button>
              </li>)}
            </ul>
          </section>
        ))}
      </div>}
    </details>
  );
}

export function ReportInvite({ code }) {
  const { profile, status } = useAccount();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/workspace#invite=${code}`;
  async function accept() {
    setBusy(true); setError('');
    try {
      const result = await acceptReportInvite(code);
      navigate(`/workspace?report=${result.id}`, { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="card reading-width" aria-labelledby="review-invite-title">
    <h1 id="review-invite-title">Read-only comparison invite</h1>
    {status === 'loading' && <LoadingPanel label="Checking account" />}
    {status === 'ready' && !profile && <p>Use the invited email address to <Link to="/sign-in" state={{ returnTo: path }}>sign in</Link> or{' '}
      <Link to="/sign-up" state={{ returnTo: path }}>create an account</Link>. If you use social sign-in, reopen this link after signing in.</p>}
    {status !== 'loading' && status !== 'ready' && !profile && <p>Account access is currently unavailable.</p>}
    {profile && <><p>Signed in as {profile.email}. Accept to add the read-only comparison to your private reports.</p>
      <button type="button" className="btn btn-primary section-top" onClick={accept} disabled={busy}>{busy ? 'Accepting…' : 'Accept invite'}</button></>}
    {error && <p className="workspace-message" role="alert">{error}</p>}
  </section>;
}

export function PrivateReport({ id, Table }) {
  const { profile, status } = useAccount();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!profile) return undefined;
    const controller = new AbortController();
    getWorkspaceReport(id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setReport(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [id, profile]);

  return (
    <div>
      <header className="page-header"><h1>Private offer comparison</h1>
        {profile && report && <p>Shared by {report.shared_by} · {CASES[report.snapshot.scenario]}</p>}
      </header>
      {status === 'loading' && <LoadingPanel label="Checking account" />}
      {status === 'ready' && !profile && <p><Link to="/sign-in"
        state={{ returnTo: `/workspace?report=${encodeURIComponent(id)}` }}>Sign in</Link> to view a report shared with your account.</p>}
      {status !== 'loading' && status !== 'ready' && <p className="workspace-message">Account access is currently unavailable.</p>}
      {profile && error && <p className="error-banner" role="alert">{error}</p>}
      {profile && !report && !error && <LoadingPanel label="Loading private report" />}
      {profile && report && <section className="card">
        <Table rows={report.snapshot.rows} />
        <ReportAssumptions assumptions={report.snapshot.assumptions} />
        <button type="button" className="btn btn-secondary section-top no-print" onClick={() => window.print()}>Print report</button>
      </section>}
      <p className="section-top no-print"><Link to="/workspace">Back to offer workspace</Link></p>
    </div>
  );
}
