"""
Loan (traditional term-loan / EMI) simulation engine.

Uses the standard annuity formula for EMI calculation and builds a full
month-by-month amortization schedule.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List
import math


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


@dataclass
class LoanResult:
    principal: float
    annual_interest_rate: float
    term_months: int

    emi: float = 0.0
    total_paid: float = 0.0
    total_interest: float = 0.0
    effective_annual_rate: float = 0.0   # effective annual rate (EAR) compounded monthly
    schedule: List[LoanAmortizationRow] = field(default_factory=list)


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
    annual_interest_rate: float,   # e.g. 0.12 for 12 %
    term_months: int,
) -> LoanResult:
    """
    Build a complete EMI amortization schedule.

    Parameters
    ----------
    principal : float
        Loan amount (₹ lakhs).
    annual_interest_rate : float
        Annual interest rate as a decimal (e.g. 0.12 for 12 %).
    term_months : int
        Loan tenor in months.

    Returns
    -------
    LoanResult
        EMI, total interest, total paid, and full schedule.
    """
    if principal <= 0:
        raise ValueError("Principal must be greater than 0.")
    if term_months <= 0:
        raise ValueError("Term months must be greater than 0.")
    if annual_interest_rate < 0:
        raise ValueError("Annual interest rate cannot be negative.")

    result = LoanResult(
        principal=principal,
        annual_interest_rate=annual_interest_rate,
        term_months=term_months,
    )

    emi = calculate_emi(principal, annual_interest_rate, term_months)
    result.emi = round(emi, 6)

    r = annual_interest_rate / 12.0
    balance = principal
    cumulative_interest = 0.0
    cumulative_principal = 0.0
    schedule: List[LoanAmortizationRow] = []

    for month in range(1, term_months + 1):
        opening = balance
        interest = opening * r
        principal_comp = emi - interest

        # Last month: adjust for floating point rounding
        if month == term_months:
            principal_comp = balance
            emi_actual = principal_comp + interest
        else:
            emi_actual = emi

        closing = max(opening - principal_comp, 0.0)
        cumulative_interest += interest
        cumulative_principal += principal_comp

        row = LoanAmortizationRow(
            month=month,
            opening_balance=round(opening, 6),
            emi=round(emi_actual, 6),
            interest_component=round(interest, 6),
            principal_component=round(principal_comp, 6),
            closing_balance=round(closing, 6),
            cumulative_interest=round(cumulative_interest, 6),
            cumulative_principal=round(cumulative_principal, 6),
        )
        schedule.append(row)
        balance = closing

    result.schedule = schedule
    result.total_interest = round(cumulative_interest, 6)
    result.total_paid = round(cumulative_interest + principal, 6)
    # Effective annual rate (EAR) compounded monthly from periodic rate
    result.effective_annual_rate = round((1 + r) ** 12 - 1, 6)

    return result

