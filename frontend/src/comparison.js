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
    },
    loan: {
      principal,
      annual_interest_rate: inputs.loan_rate_pct / 100,
      term_months: inputs.loan_term_months,
    },
  };
}

// The two schedules can end in different months. Carry forward the cumulative
// totals and use zero monthly payments after each schedule ends.
export function comparisonSchedule(results) {
  if (!results) return [];
  const isa = results.isa.schedule;
  const loan = results.loan.schedule;
  return Array.from({ length: Math.max(isa.length, loan.length) }, (_, index) => {
    const isaRow = isa[index];
    const loanRow = loan[index];
    return {
      month: index + 1,
      isa_payment: (isaRow?.payment ?? 0) * RUPEES_PER_LAKH,
      cumulative_isa: (isaRow?.cumulative_paid ?? results.isa.total_paid) * RUPEES_PER_LAKH,
      loan_emi: (loanRow?.emi ?? 0) * RUPEES_PER_LAKH,
      cumulative_loan: (loanRow
        ? loanRow.cumulative_interest + loanRow.cumulative_principal
        : results.loan.total_paid) * RUPEES_PER_LAKH,
      loan_balance: (loanRow?.closing_balance ?? 0) * RUPEES_PER_LAKH,
    };
  });
}
