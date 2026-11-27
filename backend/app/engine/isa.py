"""
ISA (Income Share Agreement) monthly simulation engine.

An ISA works as follows:
- The student receives a lump-sum (the principal).
- Repayment begins once monthly income crosses a trigger threshold.
- Each month the student pays a fixed percentage of their gross income,
  subject to a monthly payment cap.
- Repayment ends when either the total payment reaches the payment cap
  (max_multiple × principal) OR the term (months) expires.
- Annual income grows at a compound rate.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from math import isclose
from typing import List

from .apr import monthly_to_annual_apr, solve_apr


@dataclass
class ISAMonthlyRow:
    month: int
    annual_income: float          # LPA (lakhs per annum) at this point
    monthly_income: float         # annual_income / 12
    above_threshold: bool
    payment: float                # actual payment this month (0 if below threshold)
    cumulative_paid: float
    remaining_cap: float          # max_total_payment - cumulative_paid
    status: str = "paid"


@dataclass
class ISAResult:
    principal: float
    income_share_pct: float
    trigger_threshold_lpa: float
    max_multiple: float
    term_months: int
    annual_growth_rate: float
    total_cap: float
    delay_months: int = 0

    schedule: List[ISAMonthlyRow] = field(default_factory=list)
    total_paid: float = 0.0
    months_paid: int = 0          # months where payment > 0
    months_to_payoff: int | None = None   # None if term expired before full payoff
    effective_annual_rate: float | None = None
    nominal_annual_rate: float | None = None
    payment_cap_hit: bool = False
    end_reason: str = "term"


def simulate_isa(
    principal: float,
    income_share_pct: float,          # e.g. 15.0 for 15 %
    starting_income_lpa: float,       # annual income at t=0
    trigger_threshold_lpa: float,     # minimum annual income to start paying
    max_multiple: float,              # e.g. 1.5 → max repayment = 1.5 × principal
    term_months: int = 60,
    annual_income_growth_rate: float = 0.08,  # 8 % YoY
    monthly_payment_cap: float | None = None,  # hard cap per month; if None → no cap
    delay_months: int = 0,
    *,
    job_delay_months: int = 0,
    term_basis: str = "elapsed",
    max_window_months: int = 360,
    eligible_income_pct: float = 100,
    income_overrides: dict[int, float] | None = None,
    calculate_rate: bool = True,
) -> ISAResult:
    """
    Run a full month-by-month ISA simulation.

    Parameters
    ----------
    principal : float
        Amount disbursed (₹ lakhs).
    income_share_pct : float
        Fraction of monthly income to pay, expressed as percent (e.g. 15.0).
    starting_income_lpa : float
        Projected gross annual income at graduation (₹ lakhs).
    trigger_threshold_lpa : float
        ISA payments kick in only when annual income ≥ this value.
    max_multiple : float
        Total repayment is capped at max_multiple × principal.
    term_months : int
        Contract length in months; repayment lapses after this.
    annual_income_growth_rate : float
        Compound annual growth rate of income.
    monthly_payment_cap : float | None
        Optional hard ceiling on monthly payment (₹ lakhs).
    delay_months : int
        Grace period before the repayment window begins.

    Returns
    -------
    ISAResult
        Full schedule + summary statistics.
    """
    share = income_share_pct / 100.0
    max_total_payment = max_multiple * principal

    result = ISAResult(
        principal=principal,
        income_share_pct=income_share_pct,
        trigger_threshold_lpa=trigger_threshold_lpa,
        max_multiple=max_multiple,
        term_months=term_months,
        annual_growth_rate=annual_income_growth_rate,
        total_cap=max_total_payment,
        delay_months=delay_months,
    )

    cumulative_paid = 0.0
    months_paid = 0
    payoff_month: int | None = None
    schedule: List[ISAMonthlyRow] = []
    monthly_cashflows = [-principal]

    income_overrides = income_overrides or {}
    window = max_window_months if term_basis == "paying" else term_months
    result.end_reason = "window" if term_basis == "paying" else "term"
    for month in range(1, delay_months + window + 1):
        years_elapsed = max(0, month - 1 - job_delay_months) // 12
        projected_income = (
            0 if month <= job_delay_months
            else starting_income_lpa * ((1 + annual_income_growth_rate) ** years_elapsed)
        )
        annual_income = income_overrides.get(month, projected_income) * eligible_income_pct / 100
        monthly_income = annual_income / 12.0

        above = annual_income >= trigger_threshold_lpa

        remaining = max_total_payment - cumulative_paid
        eligible = above and month > delay_months
        if eligible:
            raw_payment = share * monthly_income
            if monthly_payment_cap is not None:
                raw_payment = min(raw_payment, monthly_payment_cap)
            # Cannot exceed remaining cap
            payment = min(raw_payment, remaining)
        else:
            payment = 0.0

        cap_reached = eligible and isclose(payment, remaining, rel_tol=1e-10)
        if cap_reached:
            payment = remaining
            cumulative_paid = max_total_payment
        else:
            cumulative_paid += payment
        monthly_cashflows.append(payment)
        remaining_cap = max_total_payment - cumulative_paid
        if payment > 0:
            months_paid += 1

        row = ISAMonthlyRow(
            month=month,
            annual_income=round(annual_income, 6),
            monthly_income=round(monthly_income, 6),
            above_threshold=above,
            payment=round(payment, 6),
            cumulative_paid=round(cumulative_paid, 6),
            remaining_cap=round(remaining_cap, 6),
            status="grace" if month <= delay_months else "paid" if payment > 0 else "below_threshold",
        )
        schedule.append(row)

        if cap_reached:
            payoff_month = month
            result.payment_cap_hit = True
            result.end_reason = "cap"
            break
        if term_basis == "paying" and months_paid == term_months:
            result.end_reason = "term"
            break

    result.schedule = schedule
    result.total_paid = round(cumulative_paid, 6)
    result.months_paid = months_paid
    result.months_to_payoff = payoff_month

    # Effective annual rate: IRR of cash flows
    # CF[0] = -principal (disbursement), CF[1..n] = monthly payments
    if calculate_rate and months_paid:
        try:
            monthly_irr = solve_apr(monthly_cashflows)
            result.effective_annual_rate = round(monthly_to_annual_apr(monthly_irr), 6)
            result.nominal_annual_rate = round(monthly_irr * 12, 6)
        except ValueError:
            # The cash flows can have an IRR outside the solver's bracket.
            pass

    return result

