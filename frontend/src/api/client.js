const BASE_URL = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    const body = contentType.includes('application/json')
      ? await res.json().catch(() => null)
      : null;
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map(({ loc, msg }) => `${loc.slice(1).join('.') || 'Request'}: ${msg}`).join('; ')
      : detail;
    throw new ApiError(res.status, message || `HTTP ${res.status}: ${res.statusText}`);
  }

  if (res.status === 204) return null;
  if (options.headers?.Accept === 'text/csv' && contentType.includes('text/csv')) {
    return res.blob();
  }
  if (!contentType.includes('application/json')) {
    throw new ApiError(res.status, 'The API returned an unexpected response.');
  }
  return res.json();
}

/** POST /api/scenarios — compare several salaries with the current contract terms. */
export async function getScenarios(params, incomes, signal) {
  return request('/api/scenarios', {
    method: 'POST',
    body: JSON.stringify({ ...params, incomes }),
    signal,
  });
}

/** POST /api/sensitivity — grid over starting salary and a second ISA input. */
export async function getSensitivity(params, axis, signal) {
  return request('/api/sensitivity', {
    method: 'POST',
    body: JSON.stringify({ ...params, axis }),
    signal,
  });
}

export async function getBreakEven(params, signal) {
  return request('/api/breakeven', {
    method: 'POST',
    body: JSON.stringify(params),
    signal,
  });
}

export async function compareContracts(contracts, salary) {
  return request('/api/contract-comparison', {
    method: 'POST',
    body: JSON.stringify({
      contracts: contracts.map(({ isa_params, loan_params }) => ({
        isa: { ...isa_params, starting_income_lpa: salary },
        loan: loan_params,
      })),
    }),
  });
}

/**
 * POST /api/calculate — compare ISA vs Loan for given input params
 * @param {Object} params  Input parameters matching backend schema
 */
export async function postCalculate(params) {
  return request('/api/calculate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * POST /api/export/csv — download CSV
 * @param {Object} params  Input parameters to export
 */
export async function exportCsv(params) {
  return request('/api/export/csv', {
    method: 'POST',
    headers: { Accept: 'text/csv' },
    body: JSON.stringify(params),
  });
}

const CONTRACTS_KEY = 'isa-truth-contracts-v1';
const BROWSER_CONTRACTS = import.meta.env.PROD;

function getBrowserContracts() {
  return JSON.parse(localStorage.getItem(CONTRACTS_KEY) ?? '[]');
}

export async function saveContract(label, params) {
  if (BROWSER_CONTRACTS) {
    const record = {
      id: crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('-'),
      label,
      isa_params: params.isa,
      loan_params: params.loan,
      created_at: new Date().toISOString(),
    };
    const records = getBrowserContracts();
    if (records.length >= 50) throw new Error('You can save up to 50 contracts in this browser.');
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify([record, ...records]));
    return record;
  }
  return request('/api/contracts', {
    method: 'POST',
    body: JSON.stringify({ ...params, label }),
  });
}

/** GET /api/contracts — list saved contracts */
export async function getSaved() {
  return BROWSER_CONTRACTS ? getBrowserContracts() : request('/api/contracts');
}

/**
 * DELETE /api/contracts/:id — delete a saved contract
 * @param {string|number} id
 */
export async function deleteContract(id) {
  if (BROWSER_CONTRACTS) {
    const records = getBrowserContracts().filter((record) => record.id !== id);
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify(records));
    return;
  }
  return request(`/api/contracts/${id}`, { method: 'DELETE' });
}
