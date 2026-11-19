export default function Methodology() {
  return (
    <div>
      <header className="page-header">
        <h1>Methodology</h1>
        <p>How the calculator turns contract terms and projected salaries into comparable costs.</p>
      </header>
      <article className="card reading-width methodology">
        <section>
          <h2>ISA repayment</h2>
          <p>Starting salary means projected annual gross income at graduation. It grows on each 12-month anniversary. After the grace period, each month pays the stated share of gross monthly income if annual income meets the trigger.</p>
          <p>Months below the income trigger count toward the payment window. The grace period comes before that window. The calculator clips the final payment to the remaining cap and stops when the cap or the term is reached.</p>
        </section>
        <section>
          <h2>Education loan</h2>
          <p>The loan uses the same tuition principal and a fixed monthly instalment. The monthly interest rate is the annual nominal loan rate divided by 12. At 0% interest, the monthly instalment is the principal divided by the loan term.</p>
          <p>The loan can have its own term and is modeled from the first month. Taxes, processing fees and loan moratoriums are outside this model.</p>
        </section>
        <section>
          <h2>Effective annual cost</h2>
          <p>The calculator finds the monthly rate that makes the discounted ISA payments equal the tuition paid at month zero. The effective annual rate compounds that monthly rate for 12 months. The nominal annual rate multiplies it by 12.</p>
          <p>Payments below tuition can result in a negative rate. When there are zero payments, the rate is undefined. Repayment difference is total ISA paid minus total loan paid.</p>
        </section>
        <section>
          <h2>Break-even and projections</h2>
          <p>The model searches starting salaries up to ₹100 lakh per year for the first salary where total repayments match. The income trigger can jump from below to above the loan total without an exact match.</p>
          <p>Salary growth and repayment dates are projections. Check the actual income definition, cap, fees and dates in your contract or lender’s quote before using a scenario to compare your options.</p>
        </section>
      </article>
    </div>
  );
}
