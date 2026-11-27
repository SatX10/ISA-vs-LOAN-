import { useEffect, useState } from 'react';
import { useAccount } from '../account/AccountProvider.jsx';
import { getAccountWorkspace, saveAccountWorkspace } from '../api/plannerClient.js';
import { readWorkspace } from '../offerWorkspace.js';
import LoadingPanel from './LoadingPanel.jsx';
import { ReportCenter } from './WorkspaceSharing.jsx';

export default function AccountWorkspace({ Editor }) {
  const { profile, workspaceDraft } = useAccount();
  const email = profile.email;
  const [remote, setRemote] = useState(null);
  const [draft, setDraft] = useState(() => workspaceDraft.current?.email === email ? workspaceDraft.current : null);
  const [deviceCopy] = useState(readWorkspace);
  const [editorVersion, setEditorVersion] = useState(0);
  const [reportsVersion, setReportsVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const hasDeviceCopy = Boolean(deviceCopy.offers.length || deviceCopy.payments.length || deviceCopy.settings || deviceCopy.comparisons?.length);
  const isStale = Boolean(conflict || (draft && remote && draft.revision !== remote.revision));

  useEffect(() => {
    const controller = new AbortController();
    getAccountWorkspace(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setRemote(data);
      setLoading(false);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.message);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!draft) return undefined;
    function warnBeforeClosing(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeClosing);
    return () => window.removeEventListener('beforeunload', warnBeforeClosing);
  }, [draft]);

  function updateDraft(snapshot) {
    const change = { email, snapshot, revision: draft?.revision ?? remote.revision };
    workspaceDraft.current = change;
    setDraft(change);
    setSuccess('');
  }

  async function useLatest() {
    const discard = Boolean(draft && remote);
    if (discard && !window.confirm('Discard this unsaved draft and load the account copy?')) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await getAccountWorkspace();
      if (discard) {
        setDraft(null);
        if (workspaceDraft.current?.email === email) workspaceDraft.current = null;
      }
      setConflict(false);
      setRemote(data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  function importDeviceCopy() {
    updateDraft(deviceCopy);
    setEditorVersion((count) => count + 1);
    setSuccess('Browser workspace loaded as a draft. Save to account to sync it.');
  }

  async function sync(overwrite = false) {
    if (!draft || saving) return;
    if (overwrite && !window.confirm('Replace the latest account copy with this draft, including its offers and payments?')) return;
    const current = draft;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const revision = overwrite ? (await getAccountWorkspace()).revision : current.revision;
      const result = await saveAccountWorkspace({ revision, snapshot: current.snapshot });
      setRemote({ ...result, snapshot: current.snapshot });
      setConflict(false);
      if (workspaceDraft.current?.email === email) {
        const savedAllChanges = workspaceDraft.current === current;
        const remaining = savedAllChanges ? null : { ...workspaceDraft.current, revision: result.revision };
        workspaceDraft.current = remaining;
        setDraft(remaining);
        setSuccess(savedAllChanges ? 'Workspace saved to your account.' : 'Workspace saved. You have newer unsaved changes.');
      }
    } catch (failure) {
      if (failure.status === 409) setConflict(true);
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="card workspace-sync no-print" aria-labelledby="account-workspace-title">
        <div>
          <h2 className="section-title" id="account-workspace-title">Account workspace</h2>
          <p className="workspace-meta">Save offers, funding assumptions, and payment logs to this account. Open the account workspace on another device to pick up where you left off.</p>
        </div>
        {loading && <LoadingPanel label="Loading saved workspace" />}
        {remote?.updated_at && <p className="workspace-meta">Last saved {new Date(remote.updated_at * 1000).toLocaleString()}</p>}
        {draft && <p className="workspace-sync-pending" role="status">Unsaved changes</p>}
        {isStale && <p className="workspace-message" role="alert">Another session saved a newer copy. Your draft is still here.</p>}
        {error && <p className="workspace-message" role="alert">{error}</p>}
        {success && <p className="workspace-message" role="status">{success}</p>}
        {!loading && <div className="button-row">
          {remote && !isStale && <button type="button" className="btn btn-primary" disabled={!draft || saving}
            onClick={() => sync()}>{saving ? 'Saving…' : 'Save to account'}</button>}
          {remote?.revision === 0 && hasDeviceCopy && !draft && <button type="button" className="btn btn-secondary"
            disabled={saving} onClick={importDeviceCopy}>Import from this browser</button>}
          {(!draft || isStale || !remote) && <button type="button" className="btn btn-secondary" disabled={saving}
            onClick={useLatest}>{remote || isStale ? 'Load latest account copy' : 'Retry'}</button>}
          {isStale && <button type="button" className="btn btn-secondary" disabled={saving}
            onClick={() => sync(true)}>{saving ? 'Saving…' : 'Replace account copy with draft'}</button>}
        </div>}
      </section>
      <ReportCenter refresh={reportsVersion} />
      {!loading && (remote || draft) && <Editor key={editorVersion} initialWorkspace={draft?.snapshot ?? remote?.snapshot ?? { offers: [], payments: [] }}
        syncLedger onWorkspaceChange={updateDraft} onReportShared={() => setReportsVersion((count) => count + 1)} />}
    </>
  );
}
