import { parseMonthlySchedule, PRIVATE_FIELDS } from './advancedTerms.js';

const RUPEES_PER_LAKH = 100_000;

export const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatLakhs(value) {
  return value == null ? '—' : INR.format(value * RUPEES_PER_LAKH);
}

export function formatDelta(value) {
  return value > 0 ? `+${formatLakhs(value)}` : formatLakhs(value);
}

export function lakhsToRupees(value) {
  return value * RUPEES_PER_LAKH;
}

export function formatRate(value) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`;
}

export function comparisonRequest(inputs) {
  const principal = inputs.loan_amount / RUPEES_PER_LAKH;
  return {
    isa: {
      principal,
      income_share_pct: inputs.isa_pct,
      starting_income_lpa: inputs.annual_income_lpa,
      trigger_threshold_lpa: inputs.isa_trigger_lpa,
      max_multiple: inputs.isa_cap_multiple,
      term_months: inputs.isa_term_months,
      annual_income_growth_rate: inputs.income_growth_pct / 100,
      delay_months: inputs.delay_months,
      term_basis: inputs.isa_term_basis ?? 'elapsed',
      max_window_months: inputs.isa_window ?? 360,
      monthly_payment_cap: inputs.isa_monthly_cap_inr ? inputs.isa_monthly_cap_inr / RUPEES_PER_LAKH : null,
      eligible_income_pct: inputs.eligible_income_pct ?? 100,
      job_delay_months: inputs.job_delay_months ?? 0,
      income_overrides: parseMonthlySchedule(inputs.income_overrides),
    },
    loan: {
      principal,
      annual_interest_rate: inputs.loan_rate_pct / 100,
      term_months: inputs.loan_term_months,
      upfront_fee: (inputs.loan_upfront_inr ?? 0) / RUPEES_PER_LAKH,
      financed_cost: (inputs.loan_financed_inr ?? 0) / RUPEES_PER_LAKH,
      monthly_fee: (inputs.loan_monthly_inr ?? 0) / RUPEES_PER_LAKH,
      withheld_fee: (inputs.loan_withheld_inr ?? 0) / RUPEES_PER_LAKH,
      grace_months: inputs.loan_grace ?? 0,
      grace_mode: inputs.loan_grace_mode ?? 'deferred',
      extra_monthly_payment: (inputs.loan_extra_inr ?? 0) / RUPEES_PER_LAKH,
      rate_changes: Object.fromEntries(Object.entries(parseMonthlySchedule(inputs.loan_rate_changes))
        .map(([month, rate]) => [month, rate / 100])),
      disbursements: Object.fromEntries(Object.entries(parseMonthlySchedule(inputs.loan_draws))
        .map(([month, amount]) => [month, amount / RUPEES_PER_LAKH])),
    },
    monthly_budget_inr: inputs.budget_inr ?? null,
    take_home_inr: inputs.take_home_inr ?? null,
    essential_expenses_inr: inputs.essentials_inr ?? 0,
    other_debt_inr: inputs.other_debt_inr ?? 0,
    discount_rate: (inputs.discount_pct ?? 0) / 100,
    funding_date: inputs.funding_date || null,
  };
}

export function comparisonShareUrl(inputs, includeIncome = false) {
  const params = new URLSearchParams(Object.entries(inputs).filter(([key, value]) => (
    value !== undefined && value !== '' && (includeIncome || !PRIVATE_FIELDS.has(key))
  )));
  return new URL(`/calculator?${params}`, window.location.origin).href;
}

// The two schedules can end in different months. Carry forward the cumulative
// totals and use zero monthly payments after each schedule ends.
export function comparisonSchedule(results) {
  if (!results) return [];
  const isa = results.isa.schedule;
  const loan = results.loan.schedule;
  const start = results.funding_date?.split('-').map(Number);
  return Array.from({ length: Math.max(isa.length, loan.length) }, (_, index) => {
    const isaRow = isa[index];
    const loanRow = loan[index];
    const date = start && new Date(Date.UTC(start[0], start[1] + index + 1, 0));
    if (date) date.setUTCDate(Math.min(start[2], date.getUTCDate()));
    return {
      month: index + 1,
      date: date?.toISOString().slice(0, 10),
      isa_payment: (isaRow?.payment ?? 0) * RUPEES_PER_LAKH,
      cumulative_isa: (isaRow?.cumulative_paid ?? results.isa.total_paid) * RUPEES_PER_LAKH,
      loan_emi: (loanRow?.payment ?? loanRow?.emi ?? 0) * RUPEES_PER_LAKH,
      cumulative_loan: (loanRow?.cumulative_paid ?? results.loan.total_paid) * RUPEES_PER_LAKH,
      loan_balance: (loanRow?.closing_balance ?? 0) * RUPEES_PER_LAKH,
      isa_remaining_cap: (isaRow?.remaining_cap ?? results.isa.schedule.at(-1)?.remaining_cap ?? 0) * RUPEES_PER_LAKH,
      isa_status: isaRow?.status ?? 'ended',
      loan_rate: loanRow?.annual_rate,
      loan_fee: (loanRow?.fee ?? 0) * RUPEES_PER_LAKH,
      loan_interest_deferred: (loanRow?.accrued_interest ?? 0) * RUPEES_PER_LAKH,
      loan_disbursement: (loanRow?.disbursement ?? 0) * RUPEES_PER_LAKH,
    };
  });
}
