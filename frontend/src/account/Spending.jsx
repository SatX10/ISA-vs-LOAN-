import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { deleteExpense, getExpenses, saveExpense } from '../api/plannerClient.js';
import LoadingPanel from '../components/LoadingPanel.jsx';

const CATEGORIES = {
  tuition: 'Tuition and fees', materials: 'Books and equipment', living: 'Living costs',
  travel: 'Travel', repayment: 'Repayments', other: 'Other',
};
const CURRENCY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const money = (paise) => CURRENCY.format(paise / 100);

function today() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value) => String(value).padStart(2, '0')).join('-');
}

function ExpenseForm({ expense, month, onSave, onCancel, pending }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);

  function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const amount_paise = Math.round(event.currentTarget.elements.amount.valueAsNumber * 100);
    onSave({ description: fields.description, category: fields.category, spent_on: fields.spent_on, amount_paise }, expense.id);
  }

  return (
    <form className="workspace-form expense-editor" onSubmit={submit}>
      <h3 ref={heading} tabIndex={-1}>{expense.id ? 'Edit expense' : 'Add expense'}</h3>
      <label className="workspace-field">
        <span>Description</span>
        <input name="description" defaultValue={expense.description} maxLength="100" placeholder="e.g. Course materials" required />
      </label>
      <div className="expense-fields">
        <label className="workspace-field">
          <span>Amount (₹)</span>
          <input name="amount" className="numeric" type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" required
            defaultValue={expense.id ? (expense.amount_paise / 100).toFixed(2) : ''} />
        </label>
        <label className="workspace-field">
          <span>Category</span>
          <select name="category" defaultValue={expense.category ?? 'tuition'}>
            {Object.entries(CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="workspace-field">
          <span>Date</span>
          <input name="spent_on" type="date" min="1900-01-01" max="9998-12-31" required
            defaultValue={expense.spent_on ?? (today().startsWith(month) ? today() : `${month}-01`)} />
        </label>
      </div>
      <div className="workspace-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save expense'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
      </div>
    </form>
  );
}

export default function Spending() {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState(null);
  const [editor, setEditor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [pending, setPending] = useState(false);
  const addButton = useRef(null);
  const focusOnClose = useRef(false);

  useEffect(() => {
    if (!editor && focusOnClose.current) {
      focusOnClose.current = false;
      addButton.current?.focus();
    }
  }, [editor, pending]);

  useEffect(() => {
    const request = new AbortController();
    getExpenses(month, page, request.signal).then((result) => {
      if (request.signal.aborted) return;
      const last = Math.max(1, Math.ceil(result.entry_count / result.page_size));
      if (page > last) setPage(last);
      else setData({ ...result, month, page, revision });
    }).catch((error) => {
      if (!request.signal.aborted) setLoadError(error.message);
    });
    return () => request.abort();
  }, [month, page, revision]);

  const current = data?.month === month && data.page === page && data.revision === revision ? data : null;

  function reload() {
    setLoadError('');
    refresh((value) => value + 1);
  }

  function changeMonth(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < '1900-01' || value > '9998-12') return;
    setLoadError('');
    setConfirm(null);
    setMonth(value);
    setPage(1);
  }

  function closeEditor() {
    focusOnClose.current = true;
    setEditor(null);
  }

  async function storeExpense(fields, id) {
    setPending(true);
    setMessage(null);
    try {
      await saveExpense(fields, id);
      changeMonth(fields.spent_on.slice(0, 7));
      closeEditor();
      reload();
      setMessage({ text: id ? 'Expense updated.' : 'Expense added.' });
    } catch (error) {
      setMessage({ text: error.message, error: true });
    } finally {
      setPending(false);
    }
  }

  async function removeExpense(id) {
    setPending(true);
    setMessage(null);
    try {
      await deleteExpense(id);
      setConfirm(null);
      reload();
      setMessage({ text: 'Expense deleted.' });
    } catch (error) {
      setMessage({ text: error.message, error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card spending-card" aria-labelledby="spending-title">
      <header className="spending-header">
        <div>
          <h2 id="spending-title">Education spending</h2>
          <p>Log what you’ve paid for your course, day-to-day costs, and repayments.</p>
        </div>
        <button ref={addButton} type="button" className="btn btn-primary" disabled={pending || Boolean(editor)}
          onClick={() => { setConfirm(null); setMessage(null); setEditor({}); }}>
          <Plus size={17} aria-hidden="true" /> Add expense
        </button>
      </header>
      <label className="workspace-field spending-month">
        <span>Spending month</span>
        <input type="month" value={month} min="1900-01" max="9998-12" disabled={pending || Boolean(editor)}
          onChange={(event) => changeMonth(event.target.value)} />
      </label>
      {editor && <ExpenseForm key={editor.id ?? 'new'} expense={editor} month={month} pending={pending}
        onSave={storeExpense} onCancel={() => { closeEditor(); setMessage(null); }} />}
      {message && <p className="workspace-message" role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      {loadError ? (
        <div className="workspace-message">
          <p role="alert">{loadError}</p>
          <button type="button" className="btn btn-secondary" onClick={reload}>Retry</button>
        </div>
      ) : !current ? <LoadingPanel label="Loading expenses" /> : (
        <>
          <dl className="spending-summary">
            <div><dt>Total spent</dt><dd className="numeric">{money(current.total_paise)}</dd></div>
            <div><dt>Expenses logged</dt><dd className="numeric">{current.entry_count}</dd></div>
          </dl>
          {current.entry_count === 0 ? (
            <div className="spending-empty">
              <ReceiptText size={26} strokeWidth={1.75} aria-hidden="true" />
              <p>No expenses recorded for this month.</p>
            </div>
          ) : (
            <>
              <section aria-labelledby="spending-categories">
                <h3 id="spending-categories">Spending by category</h3>
                <ul className="spending-categories">
                  {current.categories.map((group) => (
                    <li key={group.category}>
                      <span>{CATEGORIES[group.category]}</span><strong className="numeric">{money(group.total_paise)}</strong>
                      <meter min={0} max={current.total_paise} value={group.total_paise} aria-hidden="true" />
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="spending-list">
                <h3 id="spending-list">Expense history</h3>
                <ul className="expense-list">
                  {current.expenses.map((expense) => (
                    <li key={expense.id}>
                      <div>
                        <strong>{expense.description}</strong>
                        <p>{CATEGORIES[expense.category]} · {DATE.format(new Date(`${expense.spent_on}T00:00:00`))}</p>
                      </div>
                      <span className="numeric">{money(expense.amount_paise)}</span>
                      <div className="expense-actions">
                        {confirm === expense.id ? (
                          <>
                            <button type="button" className="btn btn-secondary" disabled={pending}
                              onClick={() => removeExpense(expense.id)} aria-label={`Confirm delete ${expense.description}`}>Delete</button>
                            <button type="button" className="btn btn-secondary" disabled={pending}
                              onClick={() => setConfirm(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn-secondary expense-icon" disabled={pending || Boolean(editor)}
                              aria-label={`Edit ${expense.description}`}
                              onClick={() => { setConfirm(null); setMessage(null); setEditor(expense); }}>
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button type="button" className="btn btn-secondary expense-icon" disabled={pending || Boolean(editor)}
                              aria-label={`Delete ${expense.description}`}
                              onClick={() => { setMessage(null); setConfirm(expense.id); }}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {current.entry_count > current.page_size && (
                  <nav className="expense-pagination" aria-label="Expense history pages">
                    <button type="button" className="btn btn-secondary" disabled={page === 1 || pending}
                      onClick={() => { setConfirm(null); setPage(page - 1); }}>Previous</button>
                    <span>Page {page} of {Math.ceil(current.entry_count / current.page_size)}</span>
                    <button type="button" className="btn btn-secondary" disabled={page * current.page_size >= current.entry_count || pending}
                      onClick={() => { setConfirm(null); setPage(page + 1); }}>Next</button>
                  </nav>
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
