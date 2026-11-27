import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Compass, GraduationCap, ListChecks, MapPin, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from '../account/AccountProvider.jsx';
import { getPlannerCapabilities, interpretDream, recommendDream } from '../api/plannerClient.js';
import LoadingPanel from '../components/LoadingPanel.jsx';
import { currencyFormatter, MAX_PLANNER_AMOUNT_INR } from '../lenderDirectory.js';
import '../theme/dream-path.css';

const SUBJECTS = {
  data: 'Data science and AI', software: 'Computer science and software', electronics: 'Electronics and embedded systems',
  business: 'Business and management', finance: 'Finance and accounting', design: 'Design', media: 'Journalism and digital media',
  psychology: 'Psychology',
};
const STAGES = { school: 'Still in school', class_12: 'Completed Class 12 or equivalent', graduate: 'Completed a bachelor’s degree', unsure: 'Other or unsure' };
const LEVELS = { undergraduate: 'Undergraduate', postgraduate: 'Postgraduate' };
const LEVEL_OPTIONS = { any: 'Any qualification', ...LEVELS };
const MODES = { any: 'Any format', online: 'Online', distance: 'Open and distance learning', hybrid: 'Online with in-person sessions', campus: 'On campus' };
const ENTRY_STATUS = {
  check_requirements: 'Check admission requirements', review: 'Eligibility needs a closer look',
  complete_school: 'Complete Class 12 before enrolling', complete_bachelors: 'Complete a bachelor’s degree before enrolling',
  subject_gap: 'Physics and Mathematics prerequisite missing',
};
const BUDGET_STATUS = {
  within: 'Within your budget estimate', range: 'Cost range crosses your budget', over: 'Above your budget',
  no_budget: 'Budget comparison available when you enter a limit', fees_only: 'Program fees only. Add other costs to check the full budget.',
  fees_unknown: 'Get a current fee quote from the institution',
};
const EMPTY_RESULTS = {
  market: ['This catalog currently covers India', 'For study elsewhere, start with official university program pages and compare the written fees and entry requirements. Switch to India to explore this catalog.'],
  format: ['No programs in that study format', 'Choose Any format to see programs in this field, or try another format you can attend.'],
  subject_level: ['No listed programs for that subject and level', 'Try a different qualification level if it fits your goal, or check official university listings for that subject.'],
};
const DEFAULT_PROFILE = {
  subject: '', level: 'any', stage: 'unsure', market: 'india', mode: 'any', physics_and_math: 'unsure',
  budget_inr: '', other_costs_inr: '', available_funds_inr: '', priority: 'fit',
};
const EXAMPLE = 'I want to become a data scientist after Class 12 and study in India. My total budget is ₹6 lakh.';
const COST_KEYS = ['budget_inr', 'other_costs_inr', 'available_funds_inr'];
const INR = currencyFormatter('INR');

function formatRange([low, high]) {
  return low === high ? INR.format(low) : `${INR.format(low)}–${INR.format(high)}`;
}

function Choice({ label, value, options, onChange, required = false }) {
  return (
    <label className="workspace-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
        {required && <option value="">Choose one</option>}
        {Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function CostField({ label, value, onChange, help }) {
  return (
    <label className="workspace-field">
      <span>{label}</span>
      <input type="number" className="numeric" min="0" max={MAX_PLANNER_AMOUNT_INR} step="1" inputMode="numeric"
        value={value} onChange={(event) => onChange(event.target.value)} />
      {help && <small>{help}</small>}
    </label>
  );
}

function ProgramCard({ program, review, first, stale }) {
  const {
    id, title, institution, level, mode, duration_months: months, match, fit, requirements, next_step: nextStep, sources,
    budget_status: budgetStatus, entry_status: entryStatus, fees_inr: fees, total_inr: total, gap_inr: gap, financing_inr: amount,
  } = program;
  const feesOnly = review.other_costs_inr === '';
  const beforeFunds = review.available_funds_inr === '';
  const fundingLabel = beforeFunds ? 'Funding need before savings and aid' : feesOnly ? 'Program fee funding gap' : 'Estimated funding gap';
  const dreamFunding = { title, institution, amount, feesOnly, beforeFunds };
  return (
    <article className="card dream-program" aria-labelledby={`dream-${id}`}>
      <header>
        <div className="dream-program-tags">
          {first && <span className="dream-tag">Top catalog match</span>}
          <span className="dream-tag" data-related={match === 'related'}>{match === 'direct' ? 'Direct subject fit' : 'Related route'}</span>
        </div>
        <h3 id={`dream-${id}`}>{title}</h3>
        <p>{institution}</p>
        <p className="workspace-meta">{LEVELS[level]} · {MODES[mode]} · {months / 12} years at standard pace</p>
      </header>
      <p>{fit}</p>
      <div className="dream-cost-panel">
        <dl>
          <div><dt>Published program fees</dt><dd>{fees ? formatRange(fees) : 'Confirm with institution'}</dd></div>
          {total && <div><dt>Estimated total with your other costs</dt><dd>{formatRange(total)}</dd></div>}
          {gap && <div><dt>{fundingLabel}</dt><dd>{formatRange(gap)}</dd></div>}
        </dl>
        <p className="workspace-meta" data-budget={budgetStatus}>{BUDGET_STATUS[budgetStatus]}</p>
        {gap && feesOnly && budgetStatus !== 'fees_only' && <p className="workspace-meta">The funding estimate covers published program fees. Add other costs to include them.</p>}
      </div>
      <div className="dream-entry">
        <h4>{ENTRY_STATUS[entryStatus]}</h4>
        <p>{requirements}</p>
        <p><strong>Next step</strong> {nextStep}</p>
      </div>
      <ul className="dream-source-list" aria-label="Official sources">
        {sources.map(([label, url]) => (
          <li key={url}><a className="workspace-text-link" href={url} target="_blank" rel="noreferrer">
            {label}<ArrowUpRight size={15} aria-hidden="true" />
          </a></li>
        ))}
      </ul>
      {amount && !stale && (
        <Link className="btn btn-secondary dream-funding-link" to="/planner" state={{ dreamFunding, dreamReview: review }}>
          Compare funding<ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export default function DreamPath() {
  const { profile } = useAccount();
  const { state } = useLocation();
  const [goal, setGoal] = useState('');
  const [details, setDetails] = useState(() => ({ ...DEFAULT_PROFILE, ...state?.dreamReview }));
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [working, setWorking] = useState('');
  const [reading, setReading] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const detailsHeading = useRef(null);
  const resultsHeading = useRef(null);
  const costsPanel = useRef(null);
  const request = useRef(null);
  const outcome = result?.outcome;
  const stale = Boolean(result && result.review !== details);

  useEffect(() => {
    const controller = new AbortController();
    getPlannerCapabilities(controller.signal).then(({ ai_available }) => setAiAvailable(ai_available)).catch(() => {});
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (outcome && !working) resultsHeading.current?.focus();
  }, [outcome, working]);

  function update(key, value) {
    setDetails((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function run(action, operation) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setWorking(action);
    setError(null);
    const timeout = window.setTimeout(() => {
      controller.abort();
      request.current = null;
      setWorking('');
      setError({ action, message: 'The search took too long. Try again in a moment.' });
    }, 20_000);
    try {
      await operation(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setError({ action, message: err.message });
    } finally {
      window.clearTimeout(timeout);
      if (!controller.signal.aborted) {
        setWorking('');
        request.current = null;
      }
    }
  }

  async function loadPrograms(review, signal) {
    const payload = { ...review };
    for (const key of COST_KEYS) payload[key] = review[key] === '' ? null : Number(review[key]);
    const outcome = await recommendDream(payload, signal);
    if (!signal.aborted) setResult({ outcome, review });
  }

  function findFromGoal(text, withAi, preferences = details) {
    run('read', async (signal) => {
      const { fields, mode } = await interpretDream({ goal: text, use_ai: withAi }, signal);
      if (signal.aborted) return;
      const review = { ...preferences, ...fields, subject: fields.subject ?? '' };
      if (review.level === 'any' && ['school', 'class_12'].includes(review.stage)) review.level = 'undergraduate';
      setDetails(review);
      if (fields.budget_inr != null) costsPanel.current.open = true;
      if (!review.subject) {
        setResult(null);
        setReading('We couldn’t match that goal to a field in the India catalog. Choose a field below to search, or try a more specific goal.');
        detailsHeading.current?.focus();
        return;
      }
      setReading(mode === 'fallback' ? 'Used the built-in goal reader. You can refine the details below.' : 'Review or refine the details below to update your results.');
      setWorking('find');
      await loadPrograms(review, signal);
    });
  }

  function readGoal(event) {
    event.preventDefault();
    findFromGoal(goal, Boolean(aiAvailable && profile && useAi));
  }

  function findPrograms(event) {
    event.preventDefault();
    run('find', (signal) => loadPrograms(details, signal));
  }

  const setField = (key) => (value) => update(key, value);

  return (
    <div className="dream-page">
      <header className="page-header dream-header">
        <div className="workspace-icon"><GraduationCap size={24} strokeWidth={1.75} aria-hidden="true" /></div>
        <div><h1>Dream Path</h1><p>Explore what to study, what it might cost, and how to take the next step.</p></div>
      </header>
      <div className="dream-grid">
        <div className="dream-inputs">
          <section className="card" aria-labelledby="dream-goal-heading">
            <h2 id="dream-goal-heading" className="section-title">What would you love to study or become?</h2>
            <form className="workspace-form" onSubmit={readGoal}>
              <div className="workspace-field">
                <textarea aria-labelledby="dream-goal-heading" rows={4} minLength={3} maxLength={700} value={goal} className="dream-description"
                  placeholder="I’d like to design products after Class 12. I’m interested in studying on campus…"
                  disabled={Boolean(working)} onChange={(event) => { setGoal(event.target.value); setReading(''); }} />
              </div>
              {aiAvailable && profile && (
                <label className="planner-ai-control">
                  <input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)} disabled={Boolean(working)} />
                  <span>Use AI to read my goal<small>This shares your written goal with the AI provider. Leave out personal details.</small></span>
                </label>
              )}
              <div className="workspace-actions">
                <button type="submit" className="btn btn-primary" disabled={Boolean(working) || goal.trim().length < 3}>
                  <Sparkles size={16} aria-hidden="true" />{working === 'read' ? 'Reading your goal…' : 'Find my study paths'}
                </button>
                <button type="button" className="btn dream-text-button" disabled={Boolean(working)} onClick={() => {
                  setGoal(EXAMPLE);
                  setReading('');
                  findFromGoal(EXAMPLE, false, DEFAULT_PROFILE);
                }}>
                  Try an example
                </button>
              </div>
              {error?.action === 'read' && <p className="workspace-message" role="alert">{error.message}</p>}
            </form>
          </section>
          <section className="card" aria-labelledby="dream-review-heading">
            <h2 id="dream-review-heading" className="section-title" tabIndex={-1} ref={detailsHeading}>Review your study preferences</h2>
            {reading && <p className={details.subject ? 'workspace-meta' : 'workspace-message'} role="status">{reading}</p>}
            <form onSubmit={findPrograms}>
              <fieldset className="workspace-form planner-fieldset" disabled={Boolean(working)} aria-labelledby="dream-review-heading">
                <div className="planner-field-grid">
                  <Choice label="Field of study" value={details.subject} options={SUBJECTS} onChange={setField('subject')} required />
                  <Choice label="Current education" value={details.stage} options={STAGES} onChange={setField('stage')} />
                  <Choice label="Qualification you want" value={details.level} options={LEVEL_OPTIONS} onChange={setField('level')} />
                  <Choice label="Where you want to study" value={details.market} options={{ india: 'India', elsewhere: 'Outside India' }} onChange={setField('market')} />
                  <Choice label="Study format" value={details.mode} options={MODES} onChange={setField('mode')} />
                  <Choice label="Rank by" value={details.priority} options={{ fit: 'Subject fit', cost: 'Lower published fees' }} onChange={setField('priority')} />
                </div>
                {details.subject === 'electronics' && <Choice label="Physics and Mathematics at Class 12 level" value={details.physics_and_math}
                  options={{ unsure: 'Unsure or still studying', yes: 'Both subjects completed', no: 'One or both missing' }} onChange={setField('physics_and_math')} />}
                <details className="dream-budget" ref={costsPanel}>
                  <summary>Budget and funding <span>Optional</span></summary>
                  <div className="planner-field-grid">
                    <CostField label="Total study budget (₹)" value={details.budget_inr} onChange={setField('budget_inr')} />
                    <CostField label="Other costs for the full program (₹)" value={details.other_costs_inr} onChange={setField('other_costs_inr')}
                      help="Include estimated exam fees, living costs and travel. Enter 0 if none apply." />
                    <CostField label="Funds available (₹)" value={details.available_funds_inr} onChange={setField('available_funds_inr')}
                      help="Include savings and confirmed aid only. Enter 0 if none apply." />
                  </div>
                </details>
                <button className="btn btn-secondary" type="submit" disabled={Boolean(working)}>
                  {outcome ? 'Update results' : 'Search with these preferences'}<ArrowRight size={16} aria-hidden="true" />
                </button>
                {error?.action === 'find' && <p className="workspace-message" role="alert">{error.message}</p>}
              </fieldset>
            </form>
          </section>
        </div>

        <section className="dream-results" aria-label="Study paths" aria-busy={Boolean(working)}>
          {working ? <div className="card"><LoadingPanel label={working === 'read' ? 'Reading your goal' : 'Comparing programs with your preferences'} /></div> : outcome ? (
            <>
              <div className="dream-results-heading">
                <h2 tabIndex={-1} ref={resultsHeading}>
                  {outcome.recommendations.length ? 'Your study paths' : EMPTY_RESULTS[outcome.reason][0]}
                </h2>
                {outcome.recommendations.length ? (
                  <p>{outcome.recommendations.length} {outcome.recommendations.length === 1 ? 'program' : 'programs'} from the India catalog.
                    {' '}Ranking checks entry requirements and budget, then applies your preference.</p>
                ) : <p>{EMPTY_RESULTS[outcome.reason][1]}</p>}
              </div>
              {stale && <p className="card workspace-message" role="status">Preferences changed. Select Update results to recalculate the costs and ranking.</p>}
              {outcome.recommendations.map((program, index) => (
                <ProgramCard key={program.id} program={program} review={result.review} first={index === 0} stale={stale} />
              ))}
              {outcome.recommendations.length > 0 && <footer className="dream-results-footer workspace-meta">
                <p>Program sources reviewed {new Date(`${outcome.catalog_reviewed}T00:00:00Z`).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })}.
                  {' '}Confirm current fees, exams and admission requirements before applying.</p>
                <a className="workspace-text-link" href="https://scholarships.gov.in/Students" target="_blank" rel="noreferrer">Explore the National Scholarship Portal<ArrowUpRight size={15} aria-hidden="true" /></a>
              </footer>}
            </>
          ) : (
            <div className="card dream-empty">
              <Compass size={32} strokeWidth={1.65} aria-hidden="true" />
              <h2>Your shortlist starts here</h2>
              <p>Tell us your goal or choose your preferences directly. Dream Path searches a selected catalog of Indian programs.</p>
              <ul>
                <li><MapPin size={18} aria-hidden="true" />Compare study formats and official entry requirements.</li>
                <li><ListChecks size={18} aria-hidden="true" />Add your costs and see what you may need to fund.</li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
