export const LENDER_MARKETS = {
  IN: {
    name: 'India',
    currency: 'INR',
    offers: [
      {
        id: 'sbi-student', lender: 'State Bank of India', product: 'Student Loan Scheme',
        url: 'https://sbi.bank.in/web/personal-banking/loans/education-loans/student-loan-scheme',
      },
      {
        id: 'icici-education', lender: 'ICICI Bank', product: 'Education loan',
        url: 'https://www.icici.bank.in/personal-banking/loans/education-loan',
      },
      {
        id: 'axis-education', lender: 'Axis Bank', product: 'Education loan',
        url: 'https://www.axis.bank.in/loans/education-loan',
      },
      {
        id: 'pnb-saraswati', lender: 'Punjab National Bank', product: 'PNB Saraswati education loan',
        url: 'https://pnb.bank.in/pnbsaraswatiloan.html',
      },
      {
        id: 'pnb-udaan', lender: 'Punjab National Bank', product: 'PNB Udaan study-abroad loan',
        url: 'https://www.pnb.bank.in/pnb-udaan.html',
      },
      {
        id: 'canara-vidya-turant', lender: 'Canara Bank', product: 'Vidya Turant education loan',
        url: 'https://canarabank.com/UploadedFiles/Pdf/FAQs%20-%20CANARA%20VIDYA%20TURANT%20-%20SECURITY%20FREE%20EDUCATION%20LOAN%20updated%20as%20on%2007102023-24.pdf',
      },
      {
        id: 'baroda-gyan', lender: 'Bank of Baroda', product: 'Baroda Gyan education loan',
        url: 'https://bankofbaroda.bank.in/loans/education-loan/baroda-gyan',
      },
      {
        id: 'baroda-scholar', lender: 'Bank of Baroda', product: 'Baroda Scholar study-abroad loan',
        url: 'https://bankofbaroda.bank.in/loans/education-loan/baroda-scholar',
      },
    ],
  },
  US: {
    name: 'United States',
    currency: 'USD',
    offers: [
      {
        id: 'citizens-student', lender: 'Citizens Bank', product: 'Undergraduate student loan',
        url: 'https://www.citizensbank.com/student-loans/private-student-loans',
      },
      {
        id: 'sallie-mae-student', lender: 'Sallie Mae', product: 'Undergraduate student loan',
        url: 'https://www.salliemae.com/student-loans/undergraduate-student-loans/',
      },
      {
        id: 'sofi-student', lender: 'SoFi', product: 'Undergraduate student loan',
        url: 'https://www.sofi.com/private-student-loans/undergraduate-loans/',
      },
    ],
  },
  GB: {
    name: 'United Kingdom',
    currency: 'GBP',
    offers: [
      {
        id: 'lendwise-postgraduate', lender: 'Lendwise', product: 'Postgraduate loan',
        url: 'https://lendwise.com/borrow/postgraduate-loan/',
      },
      {
        id: 'hsbc-personal', lender: 'HSBC UK', product: 'Personal loan',
        url: 'https://www.hsbc.co.uk/loans/products/personal/',
      },
      {
        id: 'natwest-personal', lender: 'NatWest', product: 'Personal loan',
        url: 'https://www.natwest.com/loans.html',
      },
    ],
  },
  CA: {
    name: 'Canada',
    currency: 'CAD',
    offers: [
      {
        id: 'rbc-student', lender: 'RBC Royal Bank', product: 'Student line of credit', revolving: true,
        url: 'https://www.rbcroyalbank.com/services/student/student-line-of-credit.html',
      },
      {
        id: 'td-student', lender: 'TD Canada Trust', product: 'Student line of credit', revolving: true,
        url: 'https://www.td.com/ca/en/personal-banking/products/loans-and-lines-of-credit/student-borrowing/student-line-of-credit',
      },
      {
        id: 'td-personal', lender: 'TD Canada Trust', product: 'Personal loan',
        url: 'https://www.td.com/ca/en/personal-banking/products/loans-and-lines-of-credit/personal-loan',
      },
    ],
  },
  AU: {
    name: 'Australia',
    currency: 'AUD',
    offers: [
      {
        id: 'commbank-education', lender: 'CommBank', product: 'Personal loan for education',
        url: 'https://www.commbank.com.au/personal-loans/education.html',
      },
      {
        id: 'nab-education', lender: 'NAB', product: 'Personal loan for education',
        url: 'https://www.nab.com.au/personal/personal-loans/education-loans',
      },
      {
        id: 'westpac-personal', lender: 'Westpac', product: 'Unsecured personal loan',
        url: 'https://www.westpac.com.au/personal-loans/unsecured-personal-loan',
      },
    ],
  },
};

export const CUSTOM_MARKET = 'other';
export const CUSTOM_OFFER = 'manual';
export const MAX_PLANNER_AMOUNT_INR = 1_000_000_000;

const currencyNames = new Intl.DisplayNames('en', { type: 'currency' });
export const QUOTE_CURRENCIES = Intl.supportedValuesOf('currency').map((code) => [
  code, `${code} · ${currencyNames.of(code)}`,
]);

export function newLoanQuote(market = '', offer = market === CUSTOM_MARKET ? CUSTOM_OFFER : '') {
  return {
    market,
    offer,
    countryName: '',
    lenderName: '',
    currency: LENDER_MARKETS[market]?.currency ?? '',
    inrPerUnit: '',
    annualRate: '',
    termMonths: '',
    graceMonths: '',
    graceMode: 'deferred',
    upfrontFee: '',
    financedCost: '',
    monthlyFee: '',
    withheldFee: '',
  };
}

export function findLoanOffer(quote) {
  return LENDER_MARKETS[quote.market]?.offers.find(({ id }) => id === quote.offer);
}

export function quoteExchangeRate(quote) {
  return quote.currency === 'INR' ? 1 : Number(quote.inrPerUnit);
}

export function currencyFormatter(currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
    style: 'currency',
    currency,
    currencyDisplay: currency === 'INR' ? 'symbol' : 'code',
    minimumFractionDigits: 0,
  });
}
