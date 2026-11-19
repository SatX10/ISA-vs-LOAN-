"""
Pytest tests for the APR / IRR solver.

The APR of a plain EMI loan should equal its nominal annual rate (effective).
We verify this by computing APR from known cash flows and comparing to the
annualised monthly rate.
"""

from __future__ import annotations
import math
import pytest

from app.engine.apr import solve_apr, monthly_to_annual_apr, effective_apr_loan
from app.engine.loan import simulate_loan, calculate_emi


# ---------------------------------------------------------------------------
# Basic IRR identity
# ---------------------------------------------------------------------------

def test_irr_simple_two_cashflows():
    """
    CF = [-100, 110] → monthly rate = 10 %, annual = (1.10)^12 − 1.
    """
    cfs = [-100.0, 110.0]
    r = solve_apr(cfs)
    assert math.isclose(r, 0.10, rel_tol=1e-6)


def test_irr_zero_rate():
    """
    CF = [-100, 50, 50] → NPV(r=0) = 0.  IRR should be 0.
    """
    cfs = [-100.0, 50.0, 50.0]
    r = solve_apr(cfs)
    assert math.isclose(r, 0.0, abs_tol=1e-6)


# ---------------------------------------------------------------------------
# Loan APR = effective rate
# ---------------------------------------------------------------------------

def test_loan_apr_matches_effective_rate_12pct():
    """
    For a 12 % nominal loan the effective annual rate should be (1+0.01)^12 − 1.
    """
    loan = simulate_loan(principal=5.0, annual_interest_rate=0.12, term_months=60)
    apr = effective_apr_loan(principal=5.0, emi=loan.emi, term_months=60)
    expected_ear = (1 + 0.12 / 12) ** 12 - 1
    assert math.isclose(apr, expected_ear, rel_tol=1e-4)


def test_loan_apr_matches_effective_rate_18pct():
    loan = simulate_loan(principal=10.0, annual_interest_rate=0.18, term_months=36)
    apr = effective_apr_loan(principal=10.0, emi=loan.emi, term_months=36)
    expected_ear = (1 + 0.18 / 12) ** 12 - 1
    assert math.isclose(apr, expected_ear, rel_tol=1e-4)


# ---------------------------------------------------------------------------
# monthly_to_annual_apr
# ---------------------------------------------------------------------------

def test_monthly_to_annual_1pct():
    annual = monthly_to_annual_apr(0.01)
    expected = (1.01) ** 12 - 1
    assert math.isclose(annual, expected, rel_tol=1e-9)


def test_monthly_to_annual_zero():
    assert monthly_to_annual_apr(0.0) == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Edge-case error handling
# ---------------------------------------------------------------------------

def test_too_few_cashflows():
    with pytest.raises(ValueError, match="at least two"):
        solve_apr([-5.0])


def test_no_bracket_all_negative():
    """All negative cash flows have no IRR."""
    with pytest.raises(ValueError):
        solve_apr([-100.0, -50.0, -50.0])


@pytest.mark.filterwarnings("error::RuntimeWarning")
def test_long_schedule_with_trailing_zero_payments():
    cashflows = [-5.0] + [0.05] * 240 + [0.0] * 120
    rate = solve_apr(cashflows)
    npv = sum(amount / (1 + rate) ** month for month, amount in enumerate(cashflows))
    assert npv == pytest.approx(0, abs=1e-7)


# ---------------------------------------------------------------------------
# Consistency with ISA engine output
# ---------------------------------------------------------------------------

def test_isa_irr_roundtrip():
    """
    Verify that solve_apr on ISA cashflows produces the same effective rate
    that the ISA engine stores in effective_annual_rate.
    """
    from app.engine.isa import simulate_isa

    result = simulate_isa(
        principal=5.0,
        income_share_pct=15.0,
        starting_income_lpa=9.0,
        trigger_threshold_lpa=4.0,
        max_multiple=1.5,
        term_months=60,
        annual_income_growth_rate=0.08,
    )
    cfs = [-5.0] + [row.payment for row in result.schedule]
    monthly_irr = solve_apr(cfs)
    ear = monthly_to_annual_apr(monthly_irr)
    assert math.isclose(ear, result.effective_annual_rate, rel_tol=1e-4)

