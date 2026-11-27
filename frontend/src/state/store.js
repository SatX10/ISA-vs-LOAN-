import { create } from 'zustand';
import { postCalculate } from '../api/client.js';
import { comparisonRequest } from '../comparison.js';
import { readAdvancedTerms } from '../advancedTerms.js';

const DEFAULT_PARAMS = {
  loan_amount: 500000,       // ₹ 5 lakh
  annual_income_lpa: 6,      // LPA (lakhs per annum)
  income_growth_pct: 8,      // % annual income growth
  isa_pct: 10,               // % of monthly income as ISA payment
  isa_cap_multiple: 1.5,     // payment cap as multiple of principal
  isa_trigger_lpa: 3,        // minimum income (LPA) before ISA kicks in
  isa_term_months: 60,       // max ISA term in months
  delay_months: 0,
  loan_rate_pct: 12,         // annual interest rate for loan
  loan_term_months: 60,      // loan repayment term in months
};

const LIMITS = {
  loan_amount: [1, 1_000_000_000],
  annual_income_lpa: [0.01, 10_000],
  income_growth_pct: [0, 30],
  isa_pct: [1, 30],
  isa_cap_multiple: [1, 4],
  isa_trigger_lpa: [0, 15],
  isa_term_months: [12, 120, true],
  delay_months: [0, 24, true],
  loan_rate_pct: [0, 60],
  loan_term_months: [1, 360, true],
};

function getInitialParams() {
  const query = new URLSearchParams(window.location.search);
  const inputs = { ...DEFAULT_PARAMS };
  for (const [name, [min, max, integer]] of Object.entries(LIMITS)) {
    const raw = query.get(name);
    if (raw == null || raw.trim() === '') continue;
    const value = Number(raw);
    if (value >= min && value <= max && (!integer || Number.isInteger(value))) {
      inputs[name] = value;
    }
  }
  return { ...inputs, ...readAdvancedTerms(query) };
}

let calculationVersion = 0;

export const useStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  inputParams: getInitialParams(),
  results: null,
  loading: false,
  error: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Update a single input parameter by key */
  setParam: (key, value) => get().setParams({ [key]: value }),

  /** Update multiple params at once */
  setParams: (patch, replace = false) => {
    calculationVersion++;
    set((state) => ({
      inputParams: { ...(replace ? DEFAULT_PARAMS : state.inputParams), ...patch },
      results: null,
      error: null,
      loading: false,
    }));
  },

  /** Call the backend /api/calculate and store results */
  calculate: async () => {
    const { inputParams } = get();
    if (get().loading) return;
    const version = ++calculationVersion;
    set({ loading: true, error: null });
    try {
      const results = await postCalculate(comparisonRequest(inputParams));
      if (version === calculationVersion) set({ results });
    } catch (err) {
      if (version === calculationVersion) set({ error: err.message });
    } finally {
      if (version === calculationVersion) set({ loading: false });
    }
  },

  /** Reset everything to defaults */
  reset: () => get().setParams({}, true),
}));
