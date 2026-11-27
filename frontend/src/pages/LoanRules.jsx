import { useState } from 'react';
import { ArrowUpRight, Building2, GraduationCap, Landmark, ListChecks, Search, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CUSTOM_MARKET, CUSTOM_OFFER, LENDER_MARKETS } from '../lenderDirectory.js';
import { LOAN_RULES, plannerLinkForRule, RULE_CATEGORIES } from '../loanRules.js';
import '../theme/loan-rules.css';

const CATEGORY_ICONS = {
  lender: Landmark, government: Building2, institution: GraduationCap,
  education: GraduationCap, regulator: ShieldCheck,
};

function RuleCard({ rule }) {
  const Icon = CATEGORY_ICONS[rule.category];
  const isLender = rule.category === 'lender';
  return (
    <article className="card loan-rule-card">
      <header className="loan-rule-heading">
        <span className="workspace-icon"><Icon size={20} aria-hidden="true" /></span>
        <div>
          <p className="workspace-meta">{LENDER_MARKETS[rule.market].name} · {RULE_CATEGORIES[rule.category]}</p>
          <h2>{rule.title}</h2>
        </div>
      </header>
      <p>{rule.summary}</p>
      <div className="loan-rule-check">
        <h3>What to verify</h3>
        <p>{rule.check}</p>
      </div>
      <div className="loan-rule-actions">
        <ul className="loan-rule-sources" aria-label="Official sources">
          {rule.sources.map(([label, href]) => (
            <li key={href}>
              <a className="workspace-text-link" href={href} target="_blank" rel="noreferrer">
                {label} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
        <Link to={plannerLinkForRule(rule)} className={`btn ${isLender ? 'btn-primary' : 'btn-secondary'}`}
          aria-label={isLender ? `Use ${rule.title} in AI Planner for ${rule.summary}` : `Compare a loan in AI Planner after reviewing ${rule.title}`}>
          {isLender ? 'Use lender in AI Planner' : 'Compare a lender quote'}
        </Link>
      </div>
    </article>
  );
}

export default function LoanRules() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const country = params.get('country') ?? 'IN';
  const market = country === 'all' || Object.hasOwn(LENDER_MARKETS, country) ? country : 'IN';
  const requestedCategory = params.get('category');
  const category = Object.hasOwn(RULE_CATEGORIES, requestedCategory) ? requestedCategory : '';
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const rules = LOAN_RULES.filter((rule) => {
    if (market !== 'all' && rule.market !== market) return false;
    if (category && rule.category !== category) return false;
    const searchable = [
      rule.title, rule.summary, rule.check, LENDER_MARKETS[rule.market].name, RULE_CATEGORIES[rule.category],
      ...rule.sources.map(([label]) => label),
    ].join(' ').toLocaleLowerCase();
    return words.every((word) => searchable.includes(word));
  });
  const manualParams = new URLSearchParams({ market: market === 'all' ? CUSTOM_MARKET : market, offer: CUSTOM_OFFER });

  function select(field, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(field, value);
    else next.delete(field);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <div className="loan-rules-page">
      <header className="page-header planner-header">
        <div className="workspace-icon"><ListChecks size={23} aria-hidden="true" /></div>
        <div>
          <h1>Education loan rules</h1>
          <p>Check what your lender, government, and school require before you apply. Use official sources and compare a written quote in AI Planner.</p>
        </div>
      </header>
      <section className="card loan-rules-filters" aria-label="Find loan rules">
        <div className="loan-rules-fields">
          <label className="workspace-field"><span>Country</span>
            <select value={market} onChange={(event) => select('country', event.target.value)}>
              {Object.entries(LENDER_MARKETS).map(([code, { name }]) => <option key={code} value={code}>{name}</option>)}
              <option value="all">All supported countries</option>
            </select>
            <small>Check both countries if you borrow in one and study in another.</small>
          </label>
          <label className="workspace-field"><span>Search rules</span>
            <span className="loan-rules-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Try collateral, FAFSA or UGC" />
            </span>
          </label>
        </div>
        <div className="loan-rules-categories" role="group" aria-label="Rule category">
          <button type="button" className="btn btn-secondary" aria-pressed={!category}
            onClick={() => select('category', '')}>All rules</button>
          {Object.entries(RULE_CATEGORIES).map(([key, label]) => (
            <button key={key} type="button" className="btn btn-secondary" aria-pressed={category === key}
              onClick={() => select('category', key)}>{label}</button>
          ))}
        </div>
      </section>

      <details className="card loan-rules-checklist">
        <summary>Checklist before applying</summary>
        <ol>
          <li>Get proof of admission, an itemized fee schedule, and disbursement and refund dates from your school.</li>
          <li>Check the campus and programme in the official education register and in the lender’s or aid programme’s eligibility list.</li>
          <li>Confirm how much funding you still need after scholarships, grants, and savings.</li>
          <li>Ask the lender for the quoted rate, rate type, fees, currency, repayment term, grace period, and interest due before installments.</li>
          <li>Confirm who must co-sign or provide security, which costs you must pay upfront, and what happens if you defer or leave the course.</li>
        </ol>
      </details>

      <div className="loan-rules-results">
        <p className="workspace-meta" role="status">{rules.length} {rules.length === 1 ? 'entry' : 'entries'} · Sources reviewed 24 Nov 2026</p>
        <Link to={`/planner?${manualParams}`} className="workspace-text-link">Enter a quote from another lender</Link>
      </div>
      {rules.length ? (
        <div className="loan-rules-grid">{rules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}</div>
      ) : (
        <div className="card">
          <h2 className="section-title">No matching rules</h2>
          <p>Try another search or clear the category filter.</p>
          <button type="button" className="btn btn-secondary section-top" onClick={() => {
            setQuery('');
            select('category', '');
          }}>Clear search and category</button>
        </div>
      )}
      <p className="workspace-meta">The directory covers selected lenders and schemes. Use the official registers for wider coverage and confirm terms for your course, intake, and application. AI Planner estimates installment loans using your quote.</p>
    </div>
  );
}
