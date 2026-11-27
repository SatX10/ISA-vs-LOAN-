import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountProvider.jsx';
import { BudgetField, PriorityField } from '../account/PlanningFields.jsx';
import { getPlannerCapabilities, suggestPlan } from '../api/plannerClient.js';
import LoadingPanel from '../components/LoadingPanel.jsx';
import LocalPlanning, { localCurrency } from '../components/LocalPlanning.jsx';
import PlannerLoanOptions from '../components/PlannerLoanOptions.jsx';
import { comparisonRequest } from '../comparison.js';
import {
  LENDER_MARKETS, MAX_PLANNER_AMOUNT_INR, currencyFormatter, findLoanOffer, quoteExchangeRate,
} from '../lenderDirectory.js';
import { readPlannerHandoff } from '../loanRules.js';
import { useStore } from '../state/store.js';

const HEADLINES = {
  isa: 'The ISA fits your priorities',
  loan: 'The loan fits your priorities',
  tie: 'Both plans fit equally well',
  neither: 'Neither plan fits your budget',
};
const REPAYMENT_INR = currencyFormatter('INR');
const EXCHANGE_INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 8 });
const METRICS = [
  ['expected_total_inr', 'Projected total'],
  ['expected_peak_inr', 'Projected peak month'],
  ['lower_total_inr', 'Lower salary total'],
  ['lower_peak_inr', 'Lower salary peak month'],
];
const PERSPECTIVE_TITLES = {
  total_cost: 'Lowest total cost',
  monthly_cost: 'Monthly affordability',
  income_flexibility: 'Income uncertainty',
};
const GRACE_INTEREST = {
  deferred: 'any accrued interest is added to the balance',
  interest_only: 'interest is due during the grace period',
  no_interest: 'interest does not accrue during the grace period',
};

function budgetHeadroom(plan, budget) {
  const remaining = Math.round((budget - Math.max(plan.expected_peak_inr, plan.lower_peak_inr)) * 100) / 100;
  if (remaining === 0) return 'uses the full budget';
  const amount = REPAYMENT_INR.format(Math.abs(remaining));
  return remaining > 0 ? `leaves ${amount} in the budget` : `goes ${amount} over budget`;
}

function PlanPerspective({ data, terms, budget, lowerSalary }) {
  const { focus, from_concern: fromConcern, no_income: noIncome } = data.perspective;
  const { isa, loan } = data.plans;
  const costDifference = loan.expected_total_inr - isa.expected_total_inr;

  return (
    <section className="planner-offer planner-perspective" aria-labelledby="planner-perspective-title">
      <div>
        <h3 id="planner-perspective-title">Help me decide</h3>
        <p className="workspace-meta">{fromConcern ? 'Based on your concern' : 'Based on your repayment priority'}</p>
      </div>
      <h4>{PERSPECTIVE_TITLES[focus]}</h4>
      {focus === 'total_cost' && (
        <>
          <p>{costDifference === 0 ? 'Both options have the same projected total at your expected salary.'
            : `At your expected salary, ${costDifference > 0 ? 'the ISA' : 'the loan'} costs ${REPAYMENT_INR.format(Math.abs(costDifference))} less over the full schedule.`}</p>
          <Link className="workspace-text-link" to="/break-even" state={{ comparisonTerms: terms }}>
            Check the break-even salary
          </Link>
        </>
      )}
      {focus === 'monthly_cost' && (
        <>
          <p>Across both salary scenarios, the highest ISA payment {budgetHeadroom(isa, budget)}.
            {' '}The highest loan payment {budgetHeadroom(loan, budget)}.</p>
          <p>Set aside a buffer for other expenses before choosing a monthly payment.</p>
        </>
      )}
      {focus === 'income_flexibility' && noIncome && (
        <>
          <p>At {lowerSalary} LPA, the peak monthly payment is {REPAYMENT_INR.format(isa.lower_peak_inr)} for the ISA and{' '}
            {REPAYMENT_INR.format(loan.lower_peak_inr)} for the loan.</p>
          <p>With no income in the first {noIncome.months} months, scheduled payments total{' '}
            {REPAYMENT_INR.format(noIncome.isa_payments_inr)} for the ISA and {REPAYMENT_INR.format(noIncome.loan_payments_inr)} for the loan.</p>
          <p className="workspace-meta">The ISA uses a {noIncome.isa_threshold_lpa} LPA eligible-income threshold.
            {' '}{noIncome.loan_grace_months
              ? `The loan has a ${noIncome.loan_grace_months}-month grace period and ${GRACE_INTEREST[noIncome.loan_grace_mode]}.`
              : 'The loan has no grace period.'}
            {' '}Scheduled payments exclude upfront fees.</p>
          <p>Ask each provider what you would owe if your income stopped after payments began.</p>
        </>
      )}
    </section>
  );
}

function PlanResult({ result, onUseTerms }) {
  const { data, budget, lowerSalary, expectedSalary, quote, terms, localization } = result;
  const title = useRef(null);
  const currency = quote && quote.currency !== 'INR' ? currencyFormatter(quote.currency) : null;
  const local = localization ? localCurrency(localization) : null;

  useLayoutEffect(() => {
    const heading = title.current;
    heading.focus({ preventScroll: true });
    const { top } = heading.getBoundingClientRect();
    if (top < 80 || top > window.innerHeight / 2) heading.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div className="planner-result" aria-live="polite">
      <p className="workspace-meta">{data.analysis_mode === 'ai' ? 'AI-prioritized next steps' : 'Calculator assessment'}</p>
      <h2 ref={title} tabIndex={-1}>{HEADLINES[data.suggestion]}</h2>
      <p>{data.reason}</p>
      <p className="workspace-meta">
        Budget <b className="numeric">{REPAYMENT_INR.format(budget)}/mo</b> · Starting salary{' '}
        <b className="numeric">{expectedSalary} LPA</b> · Lower salary <b className="numeric">{lowerSalary} LPA</b>
        {local && <small> · {local.format(budget / localization.rate)}/mo</small>}
      </p>
      {data.analysis_mode === 'fallback' && (
        <p className="workspace-message">AI analysis is temporarily unavailable. The calculator uses your selected repayment priority.</p>
      )}
      {data.perspective && <PlanPerspective data={data} terms={terms} budget={budget} lowerSalary={lowerSalary} />}
      <div className="planner-offers">
        {Object.entries(data.plans).map(([type, plan]) => {
          const loan = type === 'loan';
          return (
            <article key={type} className="planner-offer" data-plan={type}>
              <div className="planner-offer-heading">
                <h3>{loan ? quote?.lender ?? 'Calculator loan' : 'Income share agreement'}</h3>
                <span data-fits={plan.fits_budget}>{plan.fits_budget ? 'Within monthly budget' : 'Over monthly budget'}</span>
              </div>
              {loan && quote && (
                <p className="planner-offer-terms">
                  {quote.product} · {quote.country}<br />
                  {quote.annualRate}% annual interest · {quote.termMonths} months
                </p>
              )}
              <dl>
                {METRICS.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd className="numeric">
                      {REPAYMENT_INR.format(plan[key])}
                      {loan && currency && <small>≈ {currency.format(plan[key] / quote.exchangeRate)}</small>}
                      {local && (localization.currency !== 'INR' || localization.language === 'hi') && <small>≈ {local.format(plan[key] / localization.rate)}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
      {quote?.upfrontFeeInr > 0 && (
        <p className="workspace-meta">
          Total loan cost includes {REPAYMENT_INR.format(quote.upfrontFeeInr)} paid upfront, shown separately from the monthly budget.
        </p>
      )}
      {quote?.financedCostInr > 0 && (
        <p className="workspace-meta">{REPAYMENT_INR.format(quote.financedCostInr)} in costs was added to the loan balance.</p>
      )}
      {quote?.monthlyFeeInr > 0 && (
        <p className="workspace-meta">Loan payments include {REPAYMENT_INR.format(quote.monthlyFeeInr)} per month in fees.</p>
      )}
      {quote?.withheldFeeInr > 0 && (
        <p className="workspace-meta">The model adds {REPAYMENT_INR.format(quote.withheldFeeInr)} to gross borrowing so the net funding amount stays the same.</p>
      )}
      {currency && (
        <p className="workspace-meta">Converted at 1 {quote.currency} = {EXCHANGE_INR.format(quote.exchangeRate)} throughout the estimate.</p>
      )}
      <h3>Next steps</h3>
      <ol>{data.next_steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <button className="btn btn-secondary" type="button" onClick={onUseTerms}>Open this comparison in Calculator</button>
      <p className="workspace-meta">
        {quote ? 'The ISA uses your Calculator terms. The loan estimate uses the quote you entered.'
          : 'Both estimates use your Calculator terms.'} Confirm costs and repayment schedules with each provider.
      </p>
    </div>
  );
}

export default function Planner() {
  const { search, state, key } = useLocation();
  const amount = state?.dreamFunding?.amount;
  const dreamFunding = Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_PLANNER_AMOUNT_INR
    ? state.dreamFunding : null;
  return <PlannerForm key={key} handoff={readPlannerHandoff(new URLSearchParams(search))} dreamFunding={dreamFunding} dreamReview={state?.dreamReview} />;
}

function PlannerForm({ handoff, dreamFunding, dreamReview }) {
  const inputs = useStore((state) => state.inputParams);
  const setParams = useStore((state) => state.setParams);
  const calculate = useStore((state) => state.calculate);
  const navigate = useNavigate();
  const { profile, status } = useAccount();
  const [loanQuote, setLoanQuote] = useState(handoff.quote);
  const [fundingAmount, setFundingAmount] = useState(null);
  const [goal, setGoal] = useState(null);
  const [monthlyBudget, setMonthlyBudget] = useState(null);
  const [salary, setSalary] = useState(null);
  const [stress, setStress] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [localAffordability, setLocalAffordability] = useState(null);
  const [concern, setConcern] = useState('');
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef(null);

  const priority = goal ?? profile?.priority ?? 'total_cost';
  const funding = fundingAmount ?? String(dreamFunding?.amount ?? inputs.loan_amount);
  const budget = monthlyBudget ?? String(inputs.budget_inr ?? profile?.monthly_budget_inr ?? '');
  const expected = salary ?? String(inputs.annual_income_lpa);
  const lower = stress ?? String(Math.floor(Number(expected) * 75) / 100);
  const aiRequested = Boolean(profile && aiAvailable && useAi);

  useEffect(() => {
    const controller = new AbortController();
    getPlannerCapabilities(controller.signal).then(({ ai_available }) => {
      if (!controller.signal.aborted) setAiAvailable(ai_available);
    }).catch(() => {});
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError('');
    setResult(null);
    try {
      const terms = { ...inputs, ...localAffordability?.inputs, loan_amount: Number(funding), annual_income_lpa: Number(expected), budget_inr: budget === '' ? null : Number(budget) };
      let quote = null;
      if (loanQuote.offer) {
        const market = LENDER_MARKETS[loanQuote.market];
        const offer = findLoanOffer(loanQuote);
        const country = market?.name ?? loanQuote.countryName.trim();
        if (!country) throw new Error('Enter the country where you would borrow.');
        const exchangeRate = quoteExchangeRate(loanQuote);
        const convertToInr = (amount) => Number((Number(amount) * exchangeRate).toFixed(2));
        quote = {
          country,
          lender: offer?.lender ?? (loanQuote.lenderName.trim() || 'Other lender'),
          product: offer?.product ?? 'Loan quote',
          currency: loanQuote.currency,
          exchangeRate,
          annualRate: Number(loanQuote.annualRate),
          termMonths: Number(loanQuote.termMonths),
          upfrontFeeInr: convertToInr(loanQuote.upfrontFee),
          financedCostInr: convertToInr(loanQuote.financedCost),
          monthlyFeeInr: convertToInr(loanQuote.monthlyFee),
          withheldFeeInr: convertToInr(loanQuote.withheldFee),
        };
        terms.loan_rate_pct = quote.annualRate;
        terms.loan_term_months = quote.termMonths;
        terms.loan_upfront_inr = quote.upfrontFeeInr;
        terms.loan_financed_inr = quote.financedCostInr;
        terms.loan_monthly_inr = quote.monthlyFeeInr;
        terms.loan_withheld_inr = quote.withheldFeeInr;
        terms.loan_grace = Number(loanQuote.graceMonths);
        terms.loan_grace_mode = loanQuote.graceMode;
        terms.loan_extra_inr = 0;
        terms.loan_rate_changes = '';
        terms.loan_draws = '';
        terms.loan_quote_currency = quote.currency;
        terms.loan_fx_rate = quote.exchangeRate;
      }
      const data = await suggestPlan({
        ...comparisonRequest(terms),
        lower_salary_lpa: Number(lower),
        monthly_budget_inr: terms.budget_inr,
        priority,
        use_ai: aiRequested,
        ...(aiRequested && concern.trim() && { concern: concern.trim() }),
      }, controller.signal);
      if (!controller.signal.aborted) {
        setResult({ data, quote, terms, localization: localAffordability?.localization,
          budget: data.affordability?.budget_inr ?? Number(budget), lowerSalary: Number(lower), expectedSalary: Number(expected) });
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        activeRequest.current = null;
      }
    }
  }

  return (
    <div className="planner-page">
      <header className="page-header planner-header">
        <div className="workspace-icon"><Sparkles size={23} strokeWidth={1.75} aria-hidden="true" /></div>
        <div>
          <h1>AI Planner</h1>
          <p>Find which financing option fits your budget, salary expectations and repayment priority.</p>
        </div>
      </header>
      {dreamFunding && <div className="card planner-terms section-block">
        <p><strong>From Dream Path</strong> · {dreamFunding.title} at {dreamFunding.institution}</p>
        <p>Your funding amount starts at {REPAYMENT_INR.format(dreamFunding.amount)}, the upper estimate{dreamFunding.feesOnly ? ' based on published program fees' : ' including the other costs you entered'}.
          {dreamFunding.beforeFunds ? ' This amount is before savings or aid.' : ''} You can adjust it below.</p>
        <Link className="workspace-text-link" to="/dream-path" state={{ dreamReview }}>Back to Dream Path</Link>
      </div>}
      {handoff.rule && <div className="card planner-terms section-block">
        <p><strong>From Education loan rules</strong> · {handoff.rule.title}{' '}
          {handoff.rule.category === 'lender'
            ? 'Enter the terms from your written quote to calculate.'
            : 'Use the official source for this rule. Choose a separate lender quote to calculate here.'}</p>
        <Link className="workspace-text-link" to={`/loan-rules?country=${handoff.rule.market}`}>Back to loan rules</Link>
      </div>}
      <LocalPlanning inputs={inputs} onApply={(values, localization) => {
        setLocalAffordability({ inputs: values, localization }); setResult(null); setError('');
      }} />
      <div className="planner-grid">
        <form className="planner-input-stack" onSubmit={submit} onChange={() => {
          setResult(null);
          setError('');
        }}>
          <PlannerLoanOptions amount={Number(funding)} quote={loanQuote} onChange={setLoanQuote} pending={pending} />
          <section className="card" aria-labelledby="planner-inputs">
            <h2 id="planner-inputs" className="section-title">Planning inputs</h2>
            <fieldset className="workspace-form planner-fieldset" disabled={pending} aria-labelledby="planner-inputs">
              <div className="planner-terms">
                <p>The comparison uses your Calculator’s ISA terms and the same funding amount for both options.</p>
                <Link to="/calculator" className="workspace-text-link">Edit Calculator terms</Link>
              </div>
              <div className="planner-field-grid">
                <label className="workspace-field">
                  <span>Funding amount (₹)</span>
                  <input className="numeric" type="number" min="1" max={MAX_PLANNER_AMOUNT_INR} step="1" inputMode="numeric"
                    value={funding} onChange={(event) => setFundingAmount(event.target.value)} required />
                </label>
                <BudgetField value={budget} onChange={setMonthlyBudget} max={MAX_PLANNER_AMOUNT_INR} step={0.01}
                  optional={(localAffordability?.inputs.take_home_inr ?? inputs.take_home_inr) != null} />
              </div>
              <PriorityField value={priority} onChange={setGoal} />
              <div className="planner-field-grid">
                <label className="workspace-field">
                  <span>Expected starting salary (₹ lakh/year)</span>
                  <input className="numeric" type="number" min="0.01" max="10000" step="any" inputMode="decimal"
                    value={expected} onChange={(event) => setSalary(event.target.value)} required />
                </label>
                <label className="workspace-field">
                  <span>Lower starting salary (₹ lakh/year)</span>
                  <input className="numeric" type="number" min="0" max={expected || undefined} step="any" inputMode="decimal"
                    value={lower} onChange={(event) => setStress(event.target.value)} required />
                  <small>Tests what you could owe if you earn less than expected.</small>
                </label>
              </div>
              {aiAvailable && profile && (
                <label className="planner-ai-control">
                  <input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)} />
                  <span>Tailor guidance with AI
                    <small>Shares these estimates, your priority and any concern you enter with the AI provider.</small>
                  </span>
                </label>
              )}
              {aiRequested && (
                <label className="workspace-field">
                  <span>What matters most to you about this decision? · optional</span>
                  <textarea className="planner-concern" rows={3} maxLength={500} value={concern}
                    onChange={(event) => setConcern(event.target.value)}
                    aria-describedby="planner-concern-help" placeholder="I’m worried about a few months without income." />
                  <small id="planner-concern-help">Describe your concern in a sentence or two. Leave out personal details.</small>
                </label>
              )}
              {error && <p className="workspace-message" role="alert">{error}</p>}
              <button className="btn btn-primary" type="submit" disabled={pending}>
                <Sparkles size={17} strokeWidth={1.75} aria-hidden="true" />
                {pending ? 'Analyzing your plan…' : 'Suggest a plan'}
              </button>
              {!profile && status === 'ready' && (
                <p className="workspace-meta">
                  <Link to="/sign-in" state={{ returnTo: '/planner' }}>Sign in</Link> to reuse saved preferences
                  {aiAvailable ? ' and tailor guidance with AI.' : '.'}
                </p>
              )}
              {!aiAvailable && (
                <p className="workspace-meta">This preview uses the calculator to suggest a plan and next steps.</p>
              )}
            </fieldset>
          </section>
        </form>
        <section className="card planner-output" aria-label="Suggested plan" aria-busy={pending}>
          {pending ? <LoadingPanel label="Comparing your financing options" /> : result ? (
            <PlanResult result={result} onUseTerms={() => {
              setParams(result.terms);
              navigate('/calculator');
              calculate();
            }} />
          ) : (
            <div className="planner-empty">
              <Sparkles size={27} strokeWidth={1.75} aria-hidden="true" />
              <h2>Suggested plan</h2>
              <p>Enter your budget to compare both options and see what to check before you choose.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
