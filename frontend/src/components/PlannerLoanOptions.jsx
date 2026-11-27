import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { INR } from '../comparison.js';
import { AID_GUIDES } from '../loanRules.js';
import {
  CUSTOM_MARKET, CUSTOM_OFFER, LENDER_MARKETS, MAX_PLANNER_AMOUNT_INR, QUOTE_CURRENCIES, currencyFormatter,
  findLoanOffer, newLoanQuote, quoteExchangeRate,
} from '../lenderDirectory.js';

function productType(offer) {
  if (offer.revolving) return 'credit';
  return /personal/i.test(offer.product) ? 'personal' : 'education';
}

export default function PlannerLoanOptions({ amount, quote, onChange, pending }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [studyCountry, setStudyCountry] = useState('');
  const market = LENDER_MARKETS[quote.market];
  const offer = findLoanOffer(quote);
  const customMarket = quote.market === CUSTOM_MARKET;
  const customOffer = quote.offer === CUSTOM_OFFER;
  const { currency } = quote;
  const exchangeRate = quoteExchangeRate(quote);
  const foreignCurrency = currency && currency !== 'INR';
  const canConvert = foreignCurrency && exchangeRate > 0 && Number.isFinite(exchangeRate);
  const maxCost = exchangeRate > 0 ? MAX_PLANNER_AMOUNT_INR / exchangeRate : undefined;
  const currencyLabel = currency ? ` (${currency})` : '';

  function update(field, value) {
    onChange({ ...quote, [field]: value });
  }

  return (
    <section className="card" aria-labelledby="planner-loan-title">
      <h2 className="section-title" id="planner-loan-title">Loan options</h2>
      <fieldset className="workspace-form planner-fieldset" disabled={pending} aria-labelledby="planner-loan-title">
        <div className="planner-terms">
          <p>Choose where you’d borrow or use your Calculator’s loan terms.</p>
          <Link to={market ? `/loan-rules?country=${quote.market}` : '/loan-rules'} className="workspace-text-link">Browse loan rules</Link>
        </div>
        <div className="planner-field-grid">
          <label className="workspace-field">
            <span>Lender country</span>
            <select value={quote.market} onChange={(event) => {
              setTypeFilter('');
              onChange(newLoanQuote(event.target.value));
            }}>
              <option value="">Use Calculator terms</option>
              {Object.entries(LENDER_MARKETS).map(([id, { name }]) => (
                <option key={id} value={id}>{name}</option>
              ))}
              <option value={CUSTOM_MARKET}>Other country</option>
            </select>
          </label>
          {market && (
            <label className="workspace-field"><span>Filter loan type</span>
              <select value={typeFilter} onChange={(event) => {
                const type = event.target.value;
                setTypeFilter(type);
                if (type && offer && productType(offer) !== type) onChange(newLoanQuote(quote.market));
              }}>
                <option value="">All loan types</option>
                {[['education', 'Education loans'], ['personal', 'Personal loans'], ['credit', 'Student lines of credit']]
                  .filter(([type]) => market.offers.some((product) => productType(product) === type))
                  .map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </label>
          )}
          {market && (
            <label className="workspace-field">
              <span>Lender and loan type</span>
              <select value={quote.offer} required
                onChange={(event) => onChange(newLoanQuote(quote.market, event.target.value))}>
                <option value="">Choose a lender</option>
                {market.offers.filter((product) => !typeFilter || productType(product) === typeFilter).map(({ id, lender, product }) => (
                  <option key={id} value={id}>{lender} · {product}</option>
                ))}
                <option value={CUSTOM_OFFER}>Enter another lender</option>
              </select>
            </label>
          )}
          {customMarket && (
            <label className="workspace-field">
              <span>Country name</span>
              <input value={quote.countryName} maxLength={80} required
                onChange={(event) => update('countryName', event.target.value)} />
            </label>
          )}
        </div>

        <details className="calculator-term-group">
          <summary>Student aid by study destination</summary>
          <div className="calculator-fields">
            <label className="workspace-field"><span>Study destination</span>
              <select value={studyCountry} onChange={(event) => setStudyCountry(event.target.value)}>
                <option value="">Select a country</option>
                {Object.entries(LENDER_MARKETS).map(([id, { name }]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            {studyCountry && <a className="workspace-text-link" href={AID_GUIDES[studyCountry]} target="_blank" rel="noreferrer">
              View official aid or scholarship guidance
            </a>}
          </div>
        </details>

        {offer && (
          <div className="planner-lender">
            <Landmark size={20} strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h3>{offer.lender}</h3>
              <p className="workspace-meta">{offer.product}</p>
              <a href={offer.url} target="_blank" rel="noreferrer" className="workspace-text-link">
                View official loan details
              </a>
              <p className="workspace-meta">
                {offer.revolving
                  ? 'Use the rate and term for a fixed repayment schedule from your lender. This estimate assumes a single draw and equal monthly payments.'
                  : 'Check eligibility, permitted use, and repayment terms with the lender.'}
              </p>
            </div>
          </div>
        )}

        {quote.offer && (
          <>
            {customOffer && (
              <label className="workspace-field">
                <span>Lender name <small>· optional</small></span>
                <input value={quote.lenderName} maxLength={80} onChange={(event) => update('lenderName', event.target.value)} />
              </label>
            )}
            <div className="planner-field-grid">
              <label className="workspace-field">
                <span>Quote currency</span>
                <select value={currency} required onChange={(event) => onChange({
                  ...quote, currency: event.target.value, inrPerUnit: '', upfrontFee: '', financedCost: '', monthlyFee: '', withheldFee: '',
                })}>
                  <option value="">Choose a currency</option>
                  {QUOTE_CURRENCIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </label>
              {foreignCurrency && (
                <label className="workspace-field">
                  <span>INR per 1 {currency}</span>
                  <input className="numeric" type="number" min="0.00000001" max="1000000" step="any" inputMode="decimal"
                    value={quote.inrPerUnit} onChange={(event) => update('inrPerUnit', event.target.value)} required />
                  <small>Use a rate from your bank or a recent exchange-rate source.</small>
                </label>
              )}
            </div>
            {amount > 0 && (
              <p className="planner-quote-amount">
                Financing amount <b className="numeric">{INR.format(amount)}</b>
                {canConvert && <span> ≈ <b className="numeric">{currencyFormatter(currency).format(amount / exchangeRate)}</b></span>}
              </p>
            )}
            <div className="planner-field-grid">
              <label className="workspace-field">
                <span>Annual interest rate (%)</span>
                <input className="numeric" type="number" min="0" max="60" step="any" inputMode="decimal"
                  value={quote.annualRate} onChange={(event) => update('annualRate', event.target.value)} required />
                <small>Enter the quoted rate before fees.</small>
              </label>
              <label className="workspace-field">
                <span>Repayment term (months)</span>
                <input className="numeric" type="number" min="1" max="360" step="1" inputMode="numeric"
                  value={quote.termMonths} onChange={(event) => update('termMonths', event.target.value)} required />
                <small>Count the months with regular payments.</small>
              </label>
              <label className="workspace-field">
                <span>Upfront fees{currencyLabel}</span>
                <input className="numeric" type="number" min="0" max={maxCost} step="any" inputMode="decimal" placeholder="0"
                  value={quote.upfrontFee} onChange={(event) => update('upfrontFee', event.target.value)} />
                <small>Paid separately. Included in total cost.</small>
              </label>
              <label className="workspace-field">
                <span>Costs added to balance{currencyLabel}</span>
                <input className="numeric" type="number" min="0" max={maxCost} step="any" inputMode="decimal" placeholder="0"
                  value={quote.financedCost} onChange={(event) => update('financedCost', event.target.value)} />
                <small>Enter fees or interest rolled into the loan before regular payments.</small>
              </label>
              <label className="workspace-field">
                <span>Monthly fees{currencyLabel}</span>
                <input className="numeric" type="number" min="0" max={maxCost} step="any" inputMode="decimal" placeholder="0"
                  value={quote.monthlyFee} onChange={(event) => update('monthlyFee', event.target.value)} />
                <small>Added to each regular payment.</small>
              </label>
              <label className="workspace-field">
                <span>Fees withheld from funding{currencyLabel}</span>
                <input className="numeric" type="number" min="0" max={maxCost} step="any" inputMode="decimal" placeholder="0"
                  value={quote.withheldFee} onChange={(event) => update('withheldFee', event.target.value)} />
                <small>The lender deducts these from the amount they disburse.</small>
              </label>
              <label className="workspace-field">
                <span>Months before regular installments</span>
                <input className="numeric" type="number" min="0" max="120" step="1" inputMode="numeric" placeholder="0"
                  value={quote.graceMonths} onChange={(event) => update('graceMonths', event.target.value)} />
              </label>
              {Number(quote.graceMonths) > 0 && <label className="workspace-field">
                <span>Interest before installments</span>
                <select value={quote.graceMode} onChange={(event) => update('graceMode', event.target.value)}>
                  <option value="deferred">Accrues and is added at repayment</option>
                  <option value="interest_only">Paid monthly</option>
                  <option value="no_interest">No interest accrues</option>
                </select>
                <small>Enter any interest for this period once. Use the balance field for interest already capitalized before this period.</small>
              </label>}
            </div>
            <p className="workspace-meta">The estimate assumes one disbursement and holds your interest and exchange rates constant. Use Calculator for rate changes or staged disbursements.</p>
          </>
        )}
      </fieldset>
    </section>
  );
}
