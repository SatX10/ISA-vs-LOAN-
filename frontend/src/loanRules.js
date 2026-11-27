import { CUSTOM_MARKET, CUSTOM_OFFER, LENDER_MARKETS, findLoanOffer, newLoanQuote } from './lenderDirectory.js';

export const RULE_CATEGORIES = {
  lender: 'Banks and lenders',
  government: 'Government aid',
  institution: 'Schools and colleges',
  education: 'Education bodies',
  regulator: 'Financial regulators',
};

export const AID_GUIDES = {
  IN: 'https://pmvidyalaxmi.co.in/',
  US: 'https://studentaid.gov/understand-aid/types',
  GB: 'https://www.gov.uk/student-finance',
  CA: 'https://www.canada.ca/en/services/benefits/education/student-aid/grants-loans/province-apply.html',
  AU: 'https://www.studyassist.gov.au/financial-and-study-support/how-student-loans-work',
};

const COUNTRY_RULES = {
  IN: [
    {
      id: 'pm-vidyalaxmi', category: 'government', title: 'PM-Vidyalaxmi, CSIS and education loan guarantees',
      summary: 'The PM-Vidyalaxmi portal is a starting point for participating lenders and government interest support. PM-Vidyalaxmi and the Central Sector Interest Subsidy scheme have separate eligibility conditions.',
      check: 'Check your exact campus in the eligible institution list, your admission route and family income, and which benefit the bank will apply. Ask how your balance and installments change when support ends.',
      sources: [['PM-Vidyalaxmi portal and participating banks', AID_GUIDES.IN],
        ['Official scheme and subsidy FAQs', 'https://pmvidyalaxmi.co.in/PublicFaq.aspx']],
    },
    {
      id: 'india-campus', category: 'institution', title: 'Your college’s admissions and accounts offices',
      summary: 'Get the admission letter and an itemized fee schedule for your course and campus. Your lender may use those documents to decide which costs to cover and when to pay the institution.',
      check: 'Ask for tuition and hostel invoices, payment dates, refund or withdrawal terms, and written confirmation of scholarships. Check whether deposits or costs you already paid can be financed.',
      sources: [['Example lender documentation requirements', 'https://pnb.bank.in/FAQ.html?page=FAQ.html']],
    },
    {
      id: 'ugc-aicte', category: 'education', title: 'University Grants Commission and AICTE',
      summary: 'Check the degree-awarding institution with UGC and the applicable institute or programme approval for technical education with AICTE.',
      check: 'Verify the exact campus, study mode and intake. Ask the lender whether it uses a separate approved-institute list. For regulated professions, check the relevant statutory council too.',
      sources: [['University Grants Commission', 'https://www.ugc.gov.in/'],
        ['AICTE approved institutions', 'https://facilities.aicte-india.org/dashboard/pages/angulardashboard.php?pageName=ApprovedInstitutes'],
        ['UGC list of professional councils', 'https://www.ugc.gov.in/UGCofficials/Professional_Councils']],
    },
    {
      id: 'rbi', category: 'regulator', title: 'Reserve Bank of India',
      summary: 'For covered retail term loans, ask the lender for the Key Facts Statement, including the disclosed APR and repayment schedule.',
      check: 'Match the lender’s legal name in official listings. Check interest, charges, and the prepayment terms, and keep the written quote and any complaint reference.',
      sources: [['RBI bank directory', 'https://www.rbi.org.in/scripts/banklinks.aspx'],
        ['RBI Key Facts Statement rules', 'https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12663'],
        ['RBI Complaint Management System', 'https://cms.rbi.org.in/']],
    },
  ],
  US: [
    {
      id: 'federal-student-aid', category: 'government', title: 'Federal Student Aid and FAFSA',
      summary: 'Submit the FAFSA to be considered for federal student aid. Your school determines the aid offered. Interest treatment, borrowing limits and eligibility depend on the loan type and award year.',
      check: 'Confirm citizenship or eligible noncitizen status, enrollment, which loans are available to you, and the schedule from your servicer. Use the official tool for federal repayment plans.',
      sources: [['Federal Direct Loan rules', 'https://studentaid.gov/understand-aid/types/loans'],
        ['FAFSA application', 'https://studentaid.gov/h/apply-for-aid/fafsa'],
        ['Federal repayment calculator', 'https://studentaid.gov/repayment-calculator/']],
    },
    {
      id: 'us-school-aid', category: 'institution', title: 'Your school’s financial aid office',
      summary: 'Your school provides the financial aid offer and cost of attendance. Compare grants, scholarships and loans before you decide how much to borrow privately.',
      check: 'Ask when the school certifies or receives the loan, when any excess is released, how aid changes if you drop classes, and which expenses you must cover upfront.',
      sources: [['Federal guide to comparing school aid offers', 'https://studentaid.gov/articles/evaluating-financial-aid-offers/']],
    },
    {
      id: 'us-accreditation', category: 'education', title: 'U.S. Department of Education accreditation database',
      summary: 'Look up the awarding institution and any relevant programme accreditation in the Department of Education database.',
      check: 'Confirm federal aid participation and private lender eligibility separately with the school and lender.',
      sources: [['Accredited institutions and programmes', 'https://ope.ed.gov/dapip/#/home']],
    },
    {
      id: 'cfpb-fdic', category: 'regulator', title: 'CFPB and FDIC',
      summary: 'The CFPB explains private and federal student loan terms and accepts consumer complaints. FDIC BankFind helps verify a bank’s identity.',
      check: 'Check the APR, rate type, co-signer obligation and hardship provisions in the written disclosures. Ask who originates and services the loan.',
      sources: [['CFPB student loan guidance', 'https://www.consumerfinance.gov/consumer-tools/student-loans/'],
        ['FDIC BankFind', 'https://banks.data.fdic.gov/bankfind-suite/bankfind']],
    },
  ],
  GB: [
    {
      id: 'uk-student-finance', category: 'government', title: 'UK student finance and Student Loans Company',
      summary: 'Application routes depend on where you normally live. Eligibility also depends on factors such as your residency, course and previous study.',
      check: 'Identify your repayment plan and use the official income threshold and rate for that plan. Use GOV.UK for plan-specific and overseas repayment rules.',
      sources: [['Student finance and application routes', AID_GUIDES.GB],
        ['Nationality and residency checker', 'https://www.gov.uk/check-student-finance-eligibility-nationality-residency'],
        ['Plan-specific repayments', 'https://www.gov.uk/repaying-your-student-loan/what-you-pay']],
    },
    {
      id: 'uk-course-registration', category: 'institution', title: 'Your university or college’s student funding team',
      summary: 'Your provider confirms your registration for student finance. Ask its funding team which bursaries and fee arrangements apply to your course.',
      check: 'Check when registration will be confirmed, when fees become due, and what happens to payments if you withdraw, suspend or transfer.',
      sources: [['Student Finance England payment process', 'https://www.gov.uk/guidance/getting-your-first-student-finance-payment']],
    },
    {
      id: 'ofs', category: 'education', title: 'Office for Students and UK degree recognition',
      summary: 'The Office for Students maintains a register for England. GOV.UK explains how to verify degree-awarding authority in each UK nation.',
      check: 'Check the teaching provider and degree-awarding body. Ask whether your exact course and intake qualify for student finance.',
      sources: [['Office for Students Register', 'https://www.officeforstudents.org.uk/for-providers/registering-with-the-ofs/the-ofs-register/'],
        ['UK degree-awarding institutions', 'https://www.gov.uk/check-university-award-degree']],
    },
    {
      id: 'fca', category: 'regulator', title: 'Financial Conduct Authority',
      summary: 'Use the FCA register to check a private lender or broker and the permissions for the services it offers.',
      check: 'Match contact details with the register. Ask for your personal rate and fees, permitted borrowing purpose, and any early settlement charge.',
      sources: [['FCA Financial Services Register', 'https://register.fca.org.uk/s/?locale=en'],
        ['FCA guide to checking a firm', 'https://www.fca.org.uk/consumers/how-check-firm-individual-authorised']],
    },
  ],
  CA: [
    {
      id: 'canada-student-aid', category: 'government', title: 'Canada Student Grants and Loans',
      summary: 'Start with your province or territory of residence. Your application route, available aid and repayment rules can depend on the jurisdiction.',
      check: 'Check residency, programme designation, enrolment load and how the federal and provincial portions will be administered and repaid.',
      sources: [['Provincial and territorial application routes', AID_GUIDES.CA],
        ['National Student Loans Service Centre', 'https://www.csnpe-nslsc.canada.ca/en/home/how-to-apply']],
    },
    {
      id: 'canada-enrolment', category: 'institution', title: 'Your school’s financial aid office and registrar',
      summary: 'Your school may need to confirm enrolment before your funding is released. Ask the school about separate awards and bursaries.',
      check: 'Confirm which semester’s enrolment is recorded, how aid is paid, and whether your school has any deadlines before funds are expected.',
      sources: [['NSLSC enrolment and funding guidance', 'https://www.csnpe-nslsc.canada.ca/en/home/how-to-apply']],
    },
    {
      id: 'canada-designated-schools', category: 'education', title: 'Designated educational institutions',
      summary: 'Canada’s master list identifies designated schools. Provinces and territories also determine which programmes at those schools are designated for funding.',
      check: 'Look up the campus, exact programme, study year and any restrictions on your school. Confirm the result with your provincial or territorial student aid office.',
      sources: [['Official designated school list', 'https://www.canada.ca/en/employment-social-development/programs/designated-schools.html']],
    },
    {
      id: 'fcac', category: 'regulator', title: 'Financial Consumer Agency of Canada',
      summary: 'A student line of credit lets you draw up to a limit. Payments can be interest-only for some periods, depending on the lender.',
      check: 'Get the variable-rate benchmark and margin, draw schedule, payment transition and any optional charges in writing. Use a quoted installment schedule for a Planner comparison.',
      sources: [['FCAC student lines of credit guide', 'https://www.canada.ca/en/financial-consumer-agency/services/loans/student-lines-credit.html']],
    },
  ],
  AU: [
    {
      id: 'au-help', category: 'government', title: 'Higher Education Loan Program and the ATO',
      summary: 'HECS-HELP covers eligible student contributions in a Commonwealth supported place. FEE-HELP can cover eligible tuition fees. The ATO administers compulsory repayments based on income.',
      check: 'Verify citizenship or residency requirements, the type of place, the loan limit and the rules for your study period. Use the ATO’s published repayment rules for HELP.',
      sources: [['Study Assist loan types and eligibility', AID_GUIDES.AU],
        ['ATO repayment rules', 'https://www.ato.gov.au/individuals-and-families/study-and-training-support-loans/when-must-you-repay-your-loan']],
    },
    {
      id: 'au-census', category: 'institution', title: 'Your education provider and the census date',
      summary: 'Your higher education provider supplies the electronic Commonwealth Assistance Form and sets the census date for your units.',
      check: 'Confirm the right form, the submission deadline, and the process for withdrawing without incurring debt for that study period.',
      sources: [['Study Assist application deadlines', 'https://www.studyassist.gov.au/loan-eligibility/loan-deadlines']],
    },
    {
      id: 'teqsa-cricos', category: 'education', title: 'TEQSA and CRICOS',
      summary: 'TEQSA lists registered higher education providers. CRICOS lists providers and courses registered for international students studying in Australia on student visas.',
      check: 'Match the campus and course details, then confirm government aid eligibility or private loan eligibility separately.',
      sources: [['TEQSA National Register', 'https://www.teqsa.gov.au/national-register'],
        ['CRICOS course and institution search', 'https://cricos.education.gov.au/']],
    },
    {
      id: 'asic-apra', category: 'regulator', title: 'ASIC Moneysmart and APRA',
      summary: 'Moneysmart shows how to compare personal loans. APRA lists authorised deposit-taking institutions.',
      check: 'Compare total repayments, fees, comparison rate, and security and repayment conditions. Ask if the product permits your education expenses.',
      sources: [['ASIC Moneysmart personal loan guide', 'https://moneysmart.gov.au/loans/personal-loans'],
        ['APRA authorised institutions list', 'https://www.apra.gov.au/registers/list-registered-authorised-deposit-taking-institutions']],
    },
  ],
};

const LENDER_CHECKS = {
  'sbi-student': 'Check domestic or overseas course eligibility, covered fees, co-borrower and security rules, and how interest is handled before repayment.',
  'icici-education': 'Confirm campus and course eligibility, secured and unsecured options, applicable charges, and the disbursement schedule.',
  'axis-education': 'Ask which loan variant covers your course and confirm co-applicant terms, collateral, and the payment start date.',
  'pnb-saraswati': 'PNB lists this scheme for eligible admission in India. Check recognized courses, the joint borrower, your contribution, and security for your amount.',
  'pnb-udaan': 'Confirm eligible overseas institutions and courses, permitted expenses, the required contribution and collateral, and how funds will be sent.',
  'canara-vidya-turant': 'Canara lists this scheme for designated institutions in India. Check the latest institute group, borrowing limit, and repayment start date.',
  'baroda-gyan': 'Check eligibility for higher studies in India, permitted expenses, your share of the cost, and the security and repayment requirements.',
  'baroda-scholar': 'Check the overseas institution and course criteria, borrowing limit, required contribution, and how foreign fees are paid.',
  'citizens-student': 'Check school eligibility, co-signer terms, fixed or variable pricing, and in-school payment options.',
  'sallie-mae-student': 'Confirm school and degree eligibility, in-school payment options, and the conditions for co-signer release.',
  'sofi-student': 'Check school, enrolment and borrower eligibility, rate type, and the payment options during and after study.',
  'lendwise-postgraduate': 'Confirm programme and residency eligibility, when funds would be released, and when repayments would start.',
  'hsbc-personal': 'Confirm permitted use, residency, income requirements, the personal rate offered to you, and early repayment terms.',
  'natwest-personal': 'Ask about residency and account requirements, permitted use, and when regular payments would start.',
  'rbc-student': 'Check eligible programmes, rate basis, when interest is due, and how the balance transitions into repayment.',
  'td-student': 'Confirm the credit limit, co-signer requirements, rate changes, and repayment after graduation.',
  'td-personal': 'Confirm permitted use, rate type, payment frequency, term and fees for the specific offer.',
  'commbank-education': 'Check which education expenses the loan can cover, residency and income requirements, and the rate type offered.',
  'nab-education': 'Confirm permitted education expenses, the offered rate and fees, and any early repayment conditions.',
  'westpac-personal': 'Check income and residency criteria, permitted uses, actual rate and fees, and when payments would start.',
};

export const LOAN_RULES = Object.entries(LENDER_MARKETS).flatMap(([market, { offers }]) => [
  ...COUNTRY_RULES[market].map((rule) => ({ ...rule, market })),
  ...offers.map((offer) => ({
    id: offer.id,
    market,
    category: 'lender',
    title: offer.lender,
    summary: offer.product,
    check: LENDER_CHECKS[offer.id] ?? 'Check eligibility, permitted costs, security, rate, fees and the repayment schedule.',
    sources: [['Official lender terms', offer.url]],
  })),
]);

export function plannerLinkForRule(rule) {
  const params = new URLSearchParams({ market: rule.market, rule: rule.id });
  if (rule.category === 'lender') params.set('offer', rule.id);
  return `/planner?${params}`;
}

export function readPlannerHandoff(params) {
  const market = params.get('market') ?? '';
  const offer = params.get('offer') ?? '';
  if (market === CUSTOM_MARKET && offer === CUSTOM_OFFER) {
    return { quote: newLoanQuote(CUSTOM_MARKET), rule: null };
  }
  if (!Object.hasOwn(LENDER_MARKETS, market)) return { quote: newLoanQuote(), rule: null };
  const quote = newLoanQuote(market, offer);
  const matchedOffer = offer === CUSTOM_OFFER || Boolean(findLoanOffer(quote));
  const rule = LOAN_RULES.find((entry) => entry.market === market && entry.id === params.get('rule')
    && (entry.category === 'lender' ? matchedOffer && entry.id === offer : !offer));
  return { quote: matchedOffer ? quote : newLoanQuote(market), rule: rule ?? null };
}
