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
          <p>The default contract counts all months after grace. Advanced terms can count only months with a payment and stop at a maximum window. Income overrides use an annualized amount for the specific month, then apply the entered share of earnings that the contract counts. The final payment is clipped to the remaining cap.</p>
        </section>
        <section>
          <h2>Education loan</h2>
          <p>Both options use the same net education funding. Financed charges and withheld fees increase the loan balance. Upfront charges are paid at signing. Monthly charges apply during regular repayment.</p>
          <p>The model applies the entered annual rate divided by 12 each month. A rate change recalculates regular payments over the remaining term. During grace, interest can be paid monthly, deferred until regular payments start, or waived. Later disbursements are taken at the start of their entered grace month.</p>
        </section>
        <section>
          <h2>Effective annual cost</h2>
          <p>The calculator finds the monthly rate that makes the discounted ISA payments equal the tuition paid at month zero. The effective annual rate compounds that monthly rate for 12 months. The nominal annual rate multiplies it by 12.</p>
          <p>Payments below tuition can result in a negative rate. When there are zero payments, the rate is undefined. Repayment difference is total ISA paid minus total loan paid.</p>
          <p>The loan’s modeled effective rate uses the same monthly cash-flow approach for fees, rate changes, or grace. An irregular schedule with multiple cash-flow sign changes may have no single modeled rate. Present value discounts each cash flow using the annual rate you enter.</p>
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
