async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    ...(body && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok || data == null) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map(({ loc, msg }) => {
        const field = loc.at(-1)?.replaceAll('_', ' ');
        return field && field !== 'body' ? `${field} — ${msg}` : msg.replace(/^Value error, /, '');
      }).join(' ')
      : 'The service could not complete this request. Try again shortly.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const getSession = (signal) => request('/auth/session', { signal });
export const signIn = (body) => request('/auth/sign-in', { method: 'POST', body });
export const signUp = (body) => request('/auth/sign-up', { method: 'POST', body });
export const signOut = () => request('/auth/sign-out', { method: 'POST' });
export const savePreferences = (body) => request('/auth/profile', { method: 'PATCH', body });
export const getAccountWorkspace = (signal) => request('/auth/workspace', { signal });
export const saveAccountWorkspace = (body) => request('/auth/workspace', { method: 'PATCH', body });
export const createReviewerCode = () => request('/auth/workspace/reviewer-code', { method: 'POST' });
export const getWorkspaceReports = (signal) => request('/auth/workspace/reports', { signal });
export const getWorkspaceReport = (id, signal) => request(`/auth/workspace/reports/${encodeURIComponent(id)}`, { signal });
export const shareWorkspaceReport = (body) => request('/auth/workspace/reports', { method: 'POST', body });
export const deleteWorkspaceReport = (id) => request(`/auth/workspace/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const createReportInvite = (body) => request('/auth/workspace/report-invites', { method: 'POST', body });
export const getReportInvites = (signal) => request('/auth/workspace/report-invites', { signal });
export const revokeReportInvite = (id) => request(`/auth/workspace/report-invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const acceptReportInvite = (code) => request('/auth/workspace/report-invites/accept', { method: 'POST', body: { code } });
export const getExpenses = (month, page, signal) => request(
  `/auth/expenses?${new URLSearchParams({ month, page })}`, { signal },
);
export const saveExpense = (body, id) => request(id ? `/auth/expenses/${id}` : '/auth/expenses', {
  method: id ? 'PATCH' : 'POST', body,
});
export const deleteExpense = (id) => request(`/auth/expenses/${id}`, { method: 'DELETE' });
export const getLoanPayments = (offerId, signal) => request(`/auth/expenses/repayments/${encodeURIComponent(offerId)}`, { signal });
export const logLoanPayment = (offerId, body) => request(`/auth/expenses/repayments/${encodeURIComponent(offerId)}`, { method: 'POST', body });
export const getPlannerCapabilities = (signal) => request('/planner/capabilities', { signal });
export const suggestPlan = (body, signal) => request('/planner', { method: 'POST', body, signal });
export const interpretDream = (body, signal) => request('/dream/interpret', { method: 'POST', body, signal });
export const recommendDream = (body, signal) => request('/dream/recommend', { method: 'POST', body, signal });
