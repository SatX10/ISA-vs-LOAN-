import { create } from 'zustand';
import { postCalculate } from '../api/client.js';
import { comparisonRequest } from '../comparison.js';

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
  loan_amount: [50000, 2000000],
  annual_income_lpa: [1, 50],
  income_growth_pct: [0, 30],
  isa_pct: [1, 30],
  isa_cap_multiple: [1, 4],
  isa_trigger_lpa: [0, 15],
  isa_term_months: [12, 120, true],
  delay_months: [0, 24, true],
  loan_rate_pct: [0, 36],
  loan_term_months: [6, 120, true],
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
  return inputs;
}

export const useStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  inputParams: getInitialParams(),
  results: null,
  loading: false,
  error: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Update a single input parameter by key */
  setParam: (key, value) =>
    set((state) => ({
      inputParams: { ...state.inputParams, [key]: value },
      // Clear stale results when inputs change
      results: null,
      error: null,
    })),

  /** Update multiple params at once */
  setParams: (patch) =>
    set((state) => ({
      inputParams: { ...state.inputParams, ...patch },
      results: null,
      error: null,
    })),

  /** Call the backend /api/calculate and store results */
  calculate: async () => {
    const { inputParams } = get();
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const results = await postCalculate(comparisonRequest(inputParams));
      if (get().inputParams === inputParams) set({ results });
    } catch (err) {
      if (get().inputParams === inputParams) set({ error: err.message });
    } finally {
      set({ loading: false });
    }
  },

  /** Reset everything to defaults */
  reset: () =>
    set({
      inputParams: { ...DEFAULT_PARAMS },
      results: null,
      loading: false,
      error: null,
    }),
}));
