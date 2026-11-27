const MONEY = /(₹|INR)\s*([0-9][\d,]*(?:\.\d+)?)/i;

const RULES = [
  ['loan_rate_pct', 'Annual loan interest (%)', /\b(?:nominal (?:annual )?interest rate|annual interest rate|interest rate)\s*[:=—-]?\s*([\d.]+)\s*%/i, 0, 60],
  ['loan_term_months', 'Loan term (months)', /\b(?:loan term|repayment term|loan tenure)\s*[:=—-]?\s*(\d+)\s*months?\b/i, 1, 360],
  ['loan_grace', 'Loan grace period (months)', /\b(?:loan grace period|loan moratorium)\s*[:=—-]?\s*(\d+)\s*months?\b/i, 0, 120],
  ['isa_pct', 'Income share (%)', /\b(?:income share|income share rate)\s*[:=—-]?\s*([\d.]+)\s*%/i, 1, 30],
  ['isa_trigger_lpa', 'ISA income threshold (lakh/year)', /\b(?:isa income threshold|income threshold|income trigger)\s*[:=—-]?\s*(?:₹\s*)?([\d.]+)\s*(?:LPA|lakhs?\s*(?:per year|per annum))/i, 0, 15],
  ['isa_cap_multiple', 'ISA repayment cap multiplier', /\b(?:isa repayment cap|repayment cap)\s*[:=—-]?\s*([\d.]+)\s*[×x]/i, 1, 4],
  ['isa_term_months', 'ISA term (months)', /\b(?:isa term|income share term)\s*[:=—-]?\s*(\d+)\s*months?\b/i, 12, 120],
];

const FEES = [
  ['loan_upfront_inr', 'Upfront fee (₹)', /\b(?:upfront fee|processing fee)\b/i],
  ['loan_financed_inr', 'Charges added to balance (₹)', /\b(?:financed fee|capitalized charge)\b/i],
  ['loan_monthly_inr', 'Recurring monthly fee (₹)', /\b(?:monthly fee|monthly service fee)\b/i],
  ['loan_withheld_inr', 'Fee withheld from funding (₹)', /\b(?:withheld fee|deducted fee)\b/i],
];

export function findQuoteTerms(text) {
  const candidates = new Map();
  for (const line of text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    for (const [field, label, pattern, minimum, maximum] of RULES) {
      const match = pattern.exec(line);
      const value = Number(match?.[1]);
      if (match && value >= minimum && value <= maximum) {
        const key = `${field}:${value}`;
        if (!candidates.has(key)) candidates.set(key, { key, field, label, value, line });
      }
    }
    for (const [field, label, pattern] of FEES) {
      const labelMatch = pattern.exec(line);
      if (!labelMatch) continue;
      const rest = line.slice(labelMatch.index + labelMatch[0].length);
      const match = MONEY.exec(rest);
      const value = Number(match?.[2].replaceAll(',', ''));
      if (match && match.index <= 8 && value <= 1_000_000_000) {
        const key = `${field}:${value}`;
        if (!candidates.has(key)) candidates.set(key, { key, field, label, value, line });
      }
    }
  }
  return [...candidates.values()].slice(0, 40);
}
