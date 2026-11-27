export const ADVANCED_TERMS = [
  {
    title: 'ISA contract and income',
    fields: [
      { id: 'isa_term_basis', label: 'Months counted toward the ISA term', options: { elapsed: 'All elapsed months', paying: 'Only months with a payment' } },
      { id: 'isa_window', label: 'Maximum payment window (months)', min: 12, max: 360, step: 1, fallback: 360, when: { isa_term_basis: 'paying' } },
      { id: 'isa_monthly_cap_inr', label: 'Maximum ISA payment per month (₹)', min: 0, hint: 'Leave blank or enter zero if there is no monthly cap.' },
      { id: 'eligible_income_pct', label: 'Income counted by the ISA (%)', min: 0.01, max: 100, fallback: 100, hint: 'Applies to projected income and monthly overrides. Use the income definition in your agreement.' },
      { id: 'job_delay_months', label: 'Months before the first job', min: 0, max: 120, step: 1 },
      { id: 'income_overrides', label: 'Income by month (lakh/year)', schedule: true, maxMonth: 384, maxValue: 10000, hint: 'Enter month: amount on each line. Use annualized gross income, or zero for an unpaid month.' },
    ],
  },
  {
    title: 'Loan charges and repayment',
    fields: [
      { id: 'loan_upfront_inr', label: 'Separate upfront fee (₹)' },
      { id: 'loan_financed_inr', label: 'Charges added to balance (₹)' },
      { id: 'loan_monthly_inr', label: 'Fee per regular payment (₹)' },
      { id: 'loan_withheld_inr', label: 'Fee withheld from funding (₹)', hint: 'Gross borrowing increases by this fee so both options fund the same education amount.' },
      { id: 'loan_grace', label: 'Months before regular repayments', max: 120, step: 1 },
      { id: 'loan_grace_mode', label: 'Interest during this period', options: { deferred: 'Accrues and is added at repayment', interest_only: 'Paid monthly', no_interest: 'No interest accrues' } },
      { id: 'loan_extra_inr', label: 'Extra principal payment per month (₹)' },
      { id: 'loan_rate_changes', label: 'Rate changes by month (%)', schedule: true, maxMonth: 480, maxValue: 60, hint: 'Enter month: annual rate on each line. This recalculates the payment over the remaining term.' },
      { id: 'loan_draws', label: 'Later disbursements (₹)', schedule: true, maxMonth: 120, hint: 'Enter month: amount on each line during the grace period. Any remaining funding is disbursed at the start.' },
    ],
  },
  {
    title: 'Budget and today’s cost',
    fields: [
      { id: 'funding_date', label: 'Funding date', date: true, hint: 'Optional. Adds calendar dates to the schedule and export.' },
      { id: 'budget_inr', label: 'Monthly repayment budget (₹)' },
      { id: 'take_home_inr', label: 'Monthly take-home pay (₹)', hint: 'Optional. The budget can be limited to what remains after bills and other debt.' },
      { id: 'essentials_inr', label: 'Monthly essential expenses (₹)' },
      { id: 'other_debt_inr', label: 'Other monthly debt payments (₹)' },
      { id: 'discount_pct', label: 'Annual discount rate (%)', max: 60, hint: 'Optional. Use zero to compare undiscounted cash flows.' },
    ],
  },
];

const ALL_FIELDS = ADVANCED_TERMS.flatMap(({ fields }) => fields);

export const PRIVATE_FIELDS = new Set([
  'annual_income_lpa', 'income_growth_pct', 'income_overrides', 'job_delay_months',
  'budget_inr', 'take_home_inr', 'essentials_inr', 'other_debt_inr',
]);

export function parseMonthlySchedule(text = '', maxMonth = 480, maxValue = 1_000_000_000) {
  const values = {};
  for (const line of text.split(/[\n;]/)) {
    if (!line.trim()) continue;
    const match = /^\s*(\d+)\s*:\s*(\d+(?:\.\d+)?|\.\d+)\s*$/.exec(line);
    const month = Number(match?.[1]);
    const value = Number(match?.[2]);
    if (!match || month < 1 || month > maxMonth || value > maxValue || Object.hasOwn(values, month)) {
      throw new Error('Use one valid month and amount per line, with each month listed once.');
    }
    values[month] = value;
  }
  return values;
}

export function readAdvancedTerms(query) {
  const terms = {};
  for (const { id, options, schedule, date, min = 0, max = 1_000_000_000, step, maxMonth, maxValue } of ALL_FIELDS) {
    const raw = query.get(id);
    if (!raw?.trim()) continue;
    if (options) {
      if (Object.hasOwn(options, raw)) terms[id] = raw;
    } else if (date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && raw >= '1900-01-01' && raw <= '2200-12-31') terms[id] = raw;
    } else if (schedule) {
      try {
        parseMonthlySchedule(raw, maxMonth, maxValue);
        terms[id] = raw;
      } catch { /* Skip invalid schedule values from incoming links. */ }
    } else {
      const value = Number(raw);
      if (Number.isFinite(value) && value >= min && value <= max && (step !== 1 || Number.isInteger(value))) {
        terms[id] = value;
      }
    }
  }
  return terms;
}
