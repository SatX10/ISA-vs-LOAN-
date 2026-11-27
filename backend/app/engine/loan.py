"""
Loan (traditional term-loan / EMI) simulation engine.

Uses the standard annuity formula for EMI calculation and builds a full
month-by-month amortization schedule.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List
import math

from .apr import monthly_to_annual_apr, solve_apr


@dataclass
class LoanAmortizationRow:
    month: int
    opening_balance: float
    emi: float
    interest_component: float
    principal_component: float
    closing_balance: float
    cumulative_interest: float
    cumulative_principal: float
    payment: float
    cumulative_paid: float
    fee: float
    disbursement: float
    accrued_interest: float
    annual_rate: float


@dataclass
class LoanResult:
    principal: float
    annual_interest_rate: float
    term_months: int

    emi: float = 0.0
    total_paid: float = 0.0
    total_interest: float = 0.0
    effective_annual_rate: float | None = None
    schedule: List[LoanAmortizationRow] = field(default_factory=list)
    upfront_fee: float = 0.0
    financed_cost: float = 0.0
    withheld_fee: float = 0.0
    regular_fees: float = 0.0
    capitalized_interest: float = 0.0
    initial_disbursement: float = 0.0


def calculate_emi(principal: float, annual_rate: float, term_months: int) -> float:
    """
    Standard reducing-balance EMI formula.

    EMI = P × r × (1+r)^n / ((1+r)^n − 1)

    where r = monthly rate = annual_rate / 12.
    """
    if principal <= 0:
        raise ValueError("Principal must be greater than 0.")
    if term_months <= 0:
        raise ValueError("Term months must be greater than 0.")
    if annual_rate < 0:
        raise ValueError("Annual interest rate cannot be negative.")

    r = annual_rate / 12.0
    if r == 0:
        return principal / term_months

    payment_factor = r / -math.expm1(-term_months * math.log1p(r))
    return principal * payment_factor


def simulate_loan(
    principal: float,
    annual_interest_rate: float,
    term_months: int,
    *,
    upfront_fee: float = 0,
    financed_cost: float = 0,
    monthly_fee: float = 0,
    withheld_fee: float = 0,
    grace_months: int = 0,
    grace_mode: str = "deferred",
    extra_monthly_payment: float = 0,
    rate_changes: dict[int, float] | None = None,
    disbursements: dict[int, float] | None = None,
    calculate_rate: bool = True,
) -> LoanResult:
    """Model net education funding and dated monthly cash outflows in ₹ lakhs."""
    if principal <= 0:
        raise ValueError("Principal must be greater than 0.")
    if term_months <= 0:
        raise ValueError("Term months must be greater than 0.")
    if annual_interest_rate < 0:
        raise ValueError("Annual interest rate cannot be negative.")

    rate_changes = rate_changes or {}
    disbursements = disbursements or {}
    initial_disbursement = max(0, principal - sum(disbursements.values()))
    result = LoanResult(
        principal=principal,
        annual_interest_rate=annual_interest_rate,
        term_months=term_months,
        upfront_fee=upfront_fee,
        financed_cost=financed_cost,
        withheld_fee=withheld_fee,
        initial_disbursement=initial_disbursement,
    )

    annual_rate = annual_interest_rate
    balance = initial_disbursement + financed_cost + withheld_fee
    deferred_interest = 0.0
    scheduled_emi = 0.0
    cumulative_interest = 0.0
    cumulative_principal = 0.0
    cumulative_paid = upfront_fee
    cashflows = [upfront_fee - initial_disbursement]
    end_month = grace_months + term_months

    for month in range(1, end_month + 1):
        draw = disbursements.get(month, 0)
        balance += draw
        annual_rate = rate_changes.get(month, annual_rate)
        in_grace = month <= grace_months
        if month == grace_months + 1:
            balance += deferred_interest
            result.capitalized_interest = round(deferred_interest, 6)
        opening = balance
        interest = 0.0 if in_grace and grace_mode == "no_interest" else opening * annual_rate / 12
        accrued = 0.0
        fee = 0.0
        principal_comp = 0.0
        if in_grace:
            if grace_mode == "deferred":
                accrued = interest
                deferred_interest += accrued
            emi = interest - accrued
        else:
            if month == grace_months + 1 or month in rate_changes:
                scheduled_emi = calculate_emi(opening, annual_rate, end_month - month + 1)
            emi = min(opening + interest, scheduled_emi + extra_monthly_payment)
            if month == end_month:
                emi = opening + interest
            principal_comp = emi - interest
            fee = monthly_fee
            if month == grace_months + 1:
                result.emi = round(emi + fee, 6)

        closing = max(opening - principal_comp, 0.0)
        cumulative_interest += interest
        cumulative_principal += principal_comp
        payment = emi + fee
        cumulative_paid += payment
        result.regular_fees += fee
        cashflows.append(payment - draw)

        row = LoanAmortizationRow(
            month=month,
            opening_balance=round(opening, 6),
            emi=round(emi, 6),
            interest_component=round(interest - accrued, 6),
            principal_component=round(principal_comp, 6),
            closing_balance=round(closing, 6),
            cumulative_interest=round(cumulative_interest, 6),
            cumulative_principal=round(cumulative_principal, 6),
            payment=round(payment, 6),
            cumulative_paid=round(cumulative_paid, 6),
            fee=round(fee, 6),
            disbursement=round(draw, 6),
            accrued_interest=round(accrued, 6),
            annual_rate=annual_rate,
        )
        result.schedule.append(row)
        balance = closing
        if not in_grace and closing <= 1e-10:
            break

    result.regular_fees = round(result.regular_fees, 6)
    result.total_interest = round(cumulative_interest, 6)
    result.total_paid = round(cumulative_paid, 6)
    if calculate_rate:
        if not any((upfront_fee, financed_cost, withheld_fee, monthly_fee, grace_months, rate_changes)):
            result.effective_annual_rate = round(math.expm1(12 * math.log1p(annual_interest_rate / 12)), 6)
        else:
            signs = [value > 0 for value in cashflows if value != 0]
            if signs and not signs[0] and signs[-1] and signs == sorted(signs):
                try:
                    result.effective_annual_rate = round(monthly_to_annual_apr(solve_apr(cashflows)), 6)
                except ValueError:
                    pass
    return result

