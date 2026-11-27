import { comparisonRequest } from './comparison.js';

const WORKSPACE_KEY = 'isa-truth-offer-workspace-v1';

export const CASES = {
  expected: 'Expected income',
  lower: 'Lower income',
  higher: 'Higher income',
  job_delay: 'Delayed first job',
  rate_shock: 'Higher loan rates',
  fx_shock: 'Weaker repayment currency',
};

export const PERSPECTIVES = {
  student: ['Student budget', 'Compare peak payments and the months that exceed your budget.', 'lower'],
  growth: ['Earnings growth', 'Check the higher-income scenario for a larger ISA payment or an earlier cap.', 'higher'],
  freelancer: ['Irregular income', 'Use the delayed-job case and add individual unpaid months in Calculator.', 'job_delay'],
  family: ['Family or co-signer', 'Compare upfront cash, the funding gap, and the highest monthly payment.', 'expected'],
  international: ['International student', 'Check how a weaker repayment currency changes the payment for foreign quotes.', 'fx_shock'],
  adviser: ['Adviser', 'Review assumptions with the student and use the read-only report to share the comparison.', 'expected'],
  repaying: ['Already repaying', 'Compare your logged payments with the original projected schedule.', 'expected'],
};

export function readWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
    if (Array.isArray(saved?.offers) && Array.isArray(saved?.payments)) return saved;
  } catch { /* Start an empty workspace if storage is unavailable. */ }
  return { offers: [], payments: [] };
}

export function saveWorkspace(data) {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));
}

export function newId() {
  return crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), (number) => number.toString(16)).join('-');
}

export function todayLocal() {
  const now = new Date();
  return new Date(now.valueOf() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function portfolioOffer({ kind, id, label, inputs }) {
  return {
    kind, id, label, terms: comparisonRequest(inputs)[kind],
    ...(kind === 'loan' && {
      foreign_currency: Boolean(inputs.loan_quote_currency && inputs.loan_quote_currency !== 'INR'),
      funding_date: inputs.funding_date || null,
    }),
  };
}

export function buildPortfolio(settings, offers, bundleIds) {
  const {
    goal, grants, savings, family, budget, expected, lower, higher, delay, rateShock, fxShock,
  } = settings;
  return {
    funding_goal_inr: Number(goal),
    grants_inr: Number(grants),
    savings_inr: Number(savings),
    family_contribution_inr: Number(family),
    monthly_budget_inr: budget === '' ? null : Number(budget),
    take_home_inr: settings.takeHome == null || settings.takeHome === '' ? null : Number(settings.takeHome),
    essential_expenses_inr: Number(settings.essentials || 0),
    other_debt_inr: Number(settings.otherDebt || 0),
    expected_salary_lpa: Number(expected),
    lower_salary_lpa: Number(lower),
    higher_salary_lpa: Number(higher),
    extra_job_delay_months: Number(delay),
    rate_shock: Number(rateShock) / 100,
    fx_shock: Number(fxShock) / 100,
    bundle_ids: bundleIds,
    offers: offers.map(portfolioOffer),
  };
}

export function reportSnapshot(report, scenario, offers = [], settings = {}, visibility = {}) {
  const rows = report.offers.filter((offer) => offer.cases[scenario]).map(({ id, kind, label, funded_inr, remaining_gap_inr, extra_funding_inr, cases }) => {
    const saved = offers.find((offer) => offer.id === id);
    const terms = saved && visibility.terms ? comparisonRequest(saved.inputs)[kind] : null;
    return { kind, label, funded_inr, remaining_gap_inr, extra_funding_inr, quote_date: saved?.date ?? '', version: saved?.version ?? null,
      total: cases[scenario].total_inr, peak: cases[scenario].peak_inr, upfront: cases[scenario].upfront_inr,
      ...(terms && { terms: kind === 'isa' ? { duration_months: terms.term_months, share_percent: terms.income_share_pct,
        cap_multiple: terms.max_multiple, grace_months: terms.delay_months } : { duration_months: terms.term_months,
        rate_percent: Number((terms.annual_interest_rate * 100).toFixed(8)), grace_months: terms.grace_months,
        upfront_fee_inr: cases[scenario].upfront_inr, monthly_fee_inr: terms.monthly_fee * 100_000 } }),
    };
  });
  const assumptions = {};
  if (scenario === 'job_delay') assumptions.delay_months = Number(settings.delay || 0);
  if (scenario === 'rate_shock') assumptions.rate_increase_percent = Number(settings.rateShock || 0);
  if (scenario === 'fx_shock') assumptions.fx_increase_percent = Number(settings.fxShock || 0);
  if (visibility.salary) assumptions.salary_lpa = Number(settings[scenario === 'lower' || scenario === 'higher' ? scenario : 'expected']);
  if (visibility.budget && report.budget_inr != null) assumptions.budget_inr = report.budget_inr;
  return { scenario, rows, assumptions };
}

export function publicReportUrl(snapshot) {
  const url = new URL('/workspace', window.location.origin);
  url.searchParams.set('scenario', snapshot.scenario);
  url.searchParams.set('snapshot', JSON.stringify(snapshot.rows));
  if (Object.keys(snapshot.assumptions).length) url.searchParams.set('assumptions', JSON.stringify(snapshot.assumptions));
  return url.href;
}

export function readReportAssumptions(raw) {
  try {
    const assumptions = JSON.parse(raw);
    return Object.fromEntries(['delay_months', 'rate_increase_percent', 'fx_increase_percent']
      .filter((key) => Number.isFinite(assumptions?.[key]) && assumptions[key] >= 0)
      .map((key) => [key, assumptions[key]]));
  } catch { return {}; }
}

export function downloadWorkspaceCsv(filename, rows) {
  const cell = (value) => {
    const string = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(string) ? `'${string}` : string;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const file = new Blob([rows.map((row) => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readPublicReport(raw) {
  try {
    const rows = JSON.parse(raw);
    const numbers = ['funded_inr', 'remaining_gap_inr', 'extra_funding_inr', 'total', 'peak', 'upfront'];
    if (Array.isArray(rows) && rows.length >= 1 && rows.length <= 13 && rows.every(
      (row) => ['isa', 'loan', 'bundle'].includes(row?.kind) && typeof row.label === 'string' && row.label.length <= 120
        && numbers.every((key) => Number.isFinite(row[key]) && row[key] >= 0),
    )) return rows;
  } catch { /* The share link can be incomplete or malformed. */ }
  return null;
}
