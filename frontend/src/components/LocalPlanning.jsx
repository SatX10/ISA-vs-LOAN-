import { useState } from 'react';

const MARKETS = {
  INR: ['India', 'भारत', 'en-IN', 'https://scholarships.gov.in/Students', 'https://www.incometaxindia.gov.in/reckoner'],
  USD: ['United States', 'संयुक्त राज्य अमेरिका', 'en-US', 'https://studentaid.gov/understand-aid/types', 'https://www.irs.gov/individuals/tax-withholding-estimator'],
  GBP: ['United Kingdom', 'यूनाइटेड किंगडम', 'en-GB', 'https://www.gov.uk/student-finance', 'https://www.gov.uk/estimate-income-tax'],
  CAD: ['Canada', 'कनाडा', 'en-CA', 'https://www.canada.ca/en/services/benefits/education/student-aid/grants-loans.html',
    'https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/payroll-deductions-online-calculator.html'],
  AUD: ['Australia', 'ऑस्ट्रेलिया', 'en-AU', 'https://www.studyassist.gov.au/', 'https://www.ato.gov.au/calculators-and-tools/tax-withheld-calculator'],
};

const WORDS = {
  en: { title: 'Local currency, take-home pay and student aid', language: 'Language for this panel', market: 'Planning country and currency',
    exchange: 'Rupees per unit of local currency', net: 'Monthly take-home pay', essentials: 'Monthly essentials', debts: 'Other monthly debt payments',
    aid: 'Official scholarships and student aid', tax: 'Estimate take-home from payroll deductions', taxLink: 'Official tax guidance or calculator',
    gross: 'Monthly pay before taxes', withheld: 'Estimated monthly withholding and payroll deductions', useNet: 'Use estimated take-home',
    apply: 'Apply to Planner', available: 'Available for repayments', conversion: 'Using the exchange rate you enter. The comparison also shows INR.',
    applied: 'Applied to the Planner. Gross salary still determines ISA payments.',
    taxHelp: 'Use the official source for your circumstances, then enter the total estimated deductions in this separate calculation.',
    limits: 'Converted inputs must be at most ₹100 crore each. Enter a positive exchange rate.' },
  hi: { title: 'स्थानीय मुद्रा, हाथ में वेतन और छात्र सहायता', language: 'इस भाग की भाषा', market: 'देश और मुद्रा',
    exchange: 'स्थानीय मुद्रा की एक इकाई के लिए रुपये', net: 'मासिक हाथ में वेतन', essentials: 'ज़रूरी मासिक खर्च', debts: 'अन्य मासिक ऋण भुगतान',
    aid: 'आधिकारिक छात्रवृत्ति और छात्र सहायता', tax: 'कटौतियों से हाथ में आने वाले वेतन का अनुमान', taxLink: 'आधिकारिक कर जानकारी या कैलकुलेटर',
    gross: 'कर से पहले मासिक वेतन', withheld: 'अनुमानित मासिक कर और वेतन कटौतियाँ', useNet: 'अनुमानित वेतन का उपयोग करें',
    apply: 'प्लानर में लागू करें', available: 'भुगतान के लिए उपलब्ध राशि', conversion: 'आपकी दी हुई विनिमय दर लागू होगी। तुलना रुपये में भी दिखाई जाएगी।',
    applied: 'प्लानर में लागू किया गया। ISA भुगतान सकल वेतन से तय होता है।',
    taxHelp: 'आधिकारिक स्रोत की मदद लें और अनुमानित कुल कटौतियाँ इस अलग गणना में भरें।',
    limits: 'हर राशि रुपये में अधिकतम 100 करोड़ हो सकती है। धनात्मक विनिमय दर दर्ज करें।' },
};

export function localCurrency({ language, currency }) {
  return new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : MARKETS[currency][2], { style: 'currency', currency, currencyDisplay: 'code' });
}

export default function LocalPlanning({ inputs, onApply }) {
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('INR');
  const [rates, setRates] = useState({ INR: '1' });
  const [amounts, setAmounts] = useState(() => ({ net: inputs.take_home_inr ?? '', essentials: inputs.essentials_inr || '', debts: inputs.other_debt_inr || '' }));
  const [payroll, setPayroll] = useState({ gross: '', withheld: '' });
  const [message, setMessage] = useState(null);
  const t = WORDS[language];
  const market = MARKETS[currency];
  const format = localCurrency({ language, currency });
  const rate = Number(rates[currency]);
  const converted = Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, Math.round(Number(value) * rate * 100) / 100]));
  const previewNet = payroll.gross !== '' && payroll.withheld !== '' && Number(payroll.withheld) <= Number(payroll.gross)
    ? Math.round((Number(payroll.gross) - Number(payroll.withheld)) * 100) / 100 : null;
  const visible = amounts.net !== '' && Number.isFinite(rate) && rate > 0;

  function apply(event) {
    event.preventDefault();
    if (!visible || !Object.values(converted).every((value) => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000)) {
      setMessage({ error: true, text: t.limits });
      return;
    }
    onApply({ take_home_inr: converted.net, essentials_inr: converted.essentials, other_debt_inr: converted.debts }, { language, currency, rate });
    setMessage({ text: t.applied });
  }

  return <details className="card workspace-tools section-block" lang={language}>
    <summary>{t.title}</summary>
    <form className="workspace-form" onSubmit={apply} onChange={() => setMessage(null)}>
      <div className="planner-field-grid">
        <label className="workspace-field"><span>{t.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en" lang="en">English</option><option value="hi" lang="hi">हिन्दी</option>
        </select></label>
        <label className="workspace-field"><span>{t.market}</span><select value={currency} onChange={(event) => {
          setCurrency(event.target.value); setAmounts({ net: '', essentials: '', debts: '' }); setPayroll({ gross: '', withheld: '' });
        }}>
          {Object.entries(MARKETS).map(([code, [en, hi]]) => <option value={code} key={code}>{language === 'hi' ? hi : en} · {code}</option>)}
        </select></label>
        {currency !== 'INR' && <label className="workspace-field"><span>{t.exchange}</span>
          <input type="number" min="0.000001" step="any" value={rates[currency] ?? ''} required
            onChange={(event) => setRates({ ...rates, [currency]: event.target.value })} /><small>{t.conversion}</small>
        </label>}
        {['net', 'essentials', 'debts'].map((key) => <label className="workspace-field" key={key}><span>{t[key]} ({currency})</span>
          <input type="number" min="0" max="1000000000" step="0.01" required={key === 'net'} value={amounts[key]}
            onChange={(event) => setAmounts({ ...amounts, [key]: event.target.value })} />
        </label>)}
      </div>
      {visible && <p>{t.available} <strong>{format.format(Math.max(0, Number(amounts.net) - Number(amounts.essentials) - Number(amounts.debts)))}</strong></p>}
      <div><button className="btn btn-secondary" type="submit">{t.apply}</button></div>
      {message && <p className="workspace-message" role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </form>
    <p className="section-top"><a className="workspace-text-link" href={market[3]} target="_blank" rel="noreferrer">{t.aid}</a></p>
    <details className="schedule-details">
      <summary>{t.tax}</summary>
      <p>{t.taxHelp}</p><a className="workspace-text-link" href={market[4]} target="_blank" rel="noreferrer">{t.taxLink}</a>
      <div className="planner-field-grid">
        {['gross', 'withheld'].map((key) => <label className="workspace-field" key={key}><span>{t[key]} ({currency})</span>
          <input type="number" min="0" step="0.01" max="1000000000" value={payroll[key]} onChange={(event) => setPayroll({ ...payroll, [key]: event.target.value })} />
        </label>)}
      </div>
      {previewNet != null && <p className="section-top">{t.net} <strong>{format.format(previewNet)}</strong></p>}
      <button className="btn btn-secondary section-top" type="button" disabled={previewNet == null}
        onClick={() => { setAmounts({ ...amounts, net: String(previewNet) }); setMessage(null); }}>{t.useNet}</button>
    </details>
  </details>;
}
