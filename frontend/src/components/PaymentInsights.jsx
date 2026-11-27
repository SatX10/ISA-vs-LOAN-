import { useState } from 'react';
import { formatLakhs, formatRate, INR } from '../comparison.js';
import { LoanCostBreakdown, RemainingCharts } from './FinancingCharts.jsx';
import { PaymentExplanation } from './DecisionTools.jsx';

const BUDGET_ROWS = [
  ['upfront_inr', 'Cash due upfront', INR.format],
  ['peak_inr', 'Largest monthly payment', INR.format],
  ['first_payment_month', 'First payment', (month) => `Month ${month}`],
  ['last_payment_month', 'Last payment', (month) => `Month ${month}`],
  ['first_over_budget_month', 'First month over budget', (month) => `Month ${month}`],
  ['months_over_budget', 'Months over budget', String],
  ['largest_shortfall_inr', 'Largest budget shortfall', INR.format],
  ['left_after_peak_inr', 'Cash left after peak month', INR.format],
];

const ISA_STATUS = { grace: 'Grace period', below_threshold: 'No qualifying payment', paid: 'Payment due', ended: 'Agreement ended' };

function MonthInspector({ schedule }) {
  const [month, setMonth] = useState(1);
  const row = schedule[Math.min(month, schedule.length) - 1];
  if (!row) return null;
  const previous = schedule[row.month - 2];
  const resetRate = previous?.loan_rate != null && row.loan_rate != null && previous.loan_rate !== row.loan_rate;
  return (
    <div className="section-block">
      <label className="workspace-field"><span>Explain a month</span>
        <select value={row.month} onChange={(event) => setMonth(Number(event.target.value))}>
          {schedule.map((entry) => <option value={entry.month} key={entry.month}>Month {entry.month}{entry.date && ` · ${entry.date}`}</option>)}
        </select>
      </label>
      <div className="section-top">
        <p><b>ISA</b> {ISA_STATUS[row.isa_status]}. Payment {INR.format(row.isa_payment)}.
          {row.isa_status === 'paid' && row.isa_remaining_cap === 0 && ' This payment reaches the cap.'}</p>
        <p><b>Loan</b> Payment {INR.format(row.loan_emi)}.
          {resetRate && ` The entered annual rate changes to ${formatRate(row.loan_rate)}.`}
          {row.loan_fee > 0 && ` This includes ${INR.format(row.loan_fee)} in recurring fees.`}
          {row.loan_interest_deferred > 0 && ` ${INR.format(row.loan_interest_deferred)} in interest is deferred.`}
          {row.loan_disbursement > 0 && ` ${INR.format(row.loan_disbursement)} in new funding is disbursed.`}</p>
      </div>
    </div>
  );
}

export default function PaymentInsights({ results, schedule }) {
  const { affordability, loan, present_value: presentValue } = results;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  if (!affordability) return null;
  const { budget_inr: budget, isa, loan: loanBudget } = affordability;
  return (
    <>
      <section className="card">
        <h3 className="section-title">Payment timing and affordability</h3>
        <p className="section-block">{budget == null
          ? 'Add a budget under Advanced terms to check where payments exceed it.'
          : `Monthly comparison budget ${INR.format(budget)}. Upfront charges are shown separately.`}</p>
        <div className="table-scroll">
          <table className="data-table" aria-label="Affordability by option">
            <thead><tr><th scope="col">Measure</th><th scope="col">ISA</th><th scope="col">Loan</th></tr></thead>
            <tbody>{BUDGET_ROWS.map(([key, label, format]) => (
              <tr key={key}><th scope="row">{label}</th><td>{isa[key] == null ? '—' : format(isa[key])}</td>
                <td>{loanBudget[key] == null ? '—' : format(loanBudget[key])}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h3 className="section-title">What the loan costs</h3>
        <dl className="financing-metrics">
          <div><dt>Net funding</dt><dd>{formatLakhs(loan.principal)}</dd></div>
          <div><dt>Total interest</dt><dd>{formatLakhs(loan.total_interest)}</dd></div>
          <div><dt>Interest added after grace</dt><dd>{formatLakhs(loan.capitalized_interest)}</dd></div>
          <div><dt>Upfront and ongoing fees</dt><dd>{formatLakhs(loan.upfront_fee + loan.regular_fees)}</dd></div>
          <div><dt>Charges borrowed</dt><dd>{formatLakhs(loan.financed_cost + loan.withheld_fee)}</dd></div>
        </dl>
        <p className="workspace-meta">Interest added after grace is included in total interest. Borrowed charges are part of the balance.</p>
        <details className="schedule-details section-top" onToggle={(event) => setShowBreakdown(event.currentTarget.open)}>
          <summary>Loan cost breakdown chart</summary>
          {showBreakdown && <LoanCostBreakdown loan={loan} />}
        </details>
        {presentValue?.discount_rate > 0 && (
          <p className="section-top">Net cost in today’s rupees is {INR.format(presentValue.isa_net_cost_inr)} for the ISA and{' '}
            {INR.format(presentValue.loan_net_cost_inr)} for the loan at a {presentValue.discount_rate * 100}% annual discount rate.</p>
        )}
      </section>
      <details className="card schedule-details" onToggle={(event) => setShowRemaining(event.currentTarget.open)}>
        <summary>Loan balance and ISA cap charts</summary>
        {showRemaining && <RemainingCharts schedule={schedule} />}
      </details>
      <PaymentExplanation schedule={schedule} />
      <details className="card schedule-details">
        <summary>Inspect monthly payments</summary>
        <MonthInspector schedule={schedule} />
        <div className="table-scroll report-schedule" tabIndex={0} aria-label="Full monthly payment schedule" role="region">
          <table className="data-table">
            <thead><tr><th scope="col">Month</th><th scope="col">ISA status</th><th scope="col">ISA payment</th>
              <th scope="col">Loan payment</th><th scope="col">Loan balance</th><th scope="col">ISA cap left</th></tr></thead>
            <tbody>{schedule.map((row) => (
              <tr key={row.month}><th scope="row">{row.month}{row.date && ` · ${row.date}`}</th><td>{ISA_STATUS[row.isa_status]}</td>
                <td>{INR.format(row.isa_payment)}</td><td>{INR.format(row.loan_emi)}</td>
                <td>{INR.format(row.loan_balance)}</td><td>{INR.format(row.isa_remaining_cap)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
