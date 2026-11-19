"""
Pytest tests for the loan EMI + amortization engine.

Golden values:
  P = 5 L, r = 12 % p.a. (1 % monthly), n = 60 months
  EMI = 5 × 0.01 × 1.01^60 / (1.01^60 − 1)
      = 5 × 0.01 × 1.816697 / 0.816697
      ≈ 0.111222 L / month
"""

from __future__ import annotations
import math
import pytest

from app.engine.loan import simulate_loan, calculate_emi


# ---------------------------------------------------------------------------
# EMI formula tests
# ---------------------------------------------------------------------------

def test_emi_formula():
    """Test against manually computed value."""
    p = 5.0
    r_annual = 0.12
    n = 60
    r = r_annual / 12       # 0.01
    expected = p * r * (1 + r) ** n / ((1 + r) ** n - 1)
    result = calculate_emi(p, r_annual, n)
    assert math.isclose(result, expected, rel_tol=1e-9)


def test_emi_zero_rate():
    emi = calculate_emi(6.0, 0.0, 12)
    assert math.isclose(emi, 0.5, rel_tol=1e-9)   # 6/12


def test_emi_near_zero_rate():
    assert calculate_emi(6.0, 1e-16, 12) == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_loan():
    return simulate_loan(
        principal=5.0,
        annual_interest_rate=0.12,
        term_months=60,
    )


# ---------------------------------------------------------------------------
# Schedule structure
# ---------------------------------------------------------------------------

def test_schedule_length(base_loan):
    assert len(base_loan.schedule) == 60


def test_months_sequential(base_loan):
    for i, row in enumerate(base_loan.schedule):
        assert row.month == i + 1


def test_closing_balance_decreases(base_loan):
    """Closing balance must strictly decrease month-over-month."""
    for i in range(1, len(base_loan.schedule)):
        assert base_loan.schedule[i].closing_balance < base_loan.schedule[i - 1].closing_balance


def test_opening_balance_continuity(base_loan):
    """Opening balance of month i must equal closing balance of month i-1."""
    for i in range(1, len(base_loan.schedule)):
        assert math.isclose(
            base_loan.schedule[i].opening_balance,
            base_loan.schedule[i - 1].closing_balance,
            abs_tol=1e-5,
        )


def test_final_closing_balance_zero(base_loan):
    assert abs(base_loan.schedule[-1].closing_balance) == 0.0


# ---------------------------------------------------------------------------
# Interest + principal decomposition
# ---------------------------------------------------------------------------

def test_emi_equals_interest_plus_principal(base_loan):
    """Every month's EMI must equal interest + principal components."""
    for row in base_loan.schedule:
        assert math.isclose(
            row.emi,
            row.interest_component + row.principal_component,
            abs_tol=1e-4,
        )


def test_interest_decreases_over_time(base_loan):
    """Interest component should decrease monotonically for a standard loan."""
    interests = [r.interest_component for r in base_loan.schedule]
    for i in range(1, len(interests)):
        assert interests[i] <= interests[i - 1] + 1e-9


def test_principal_increases_over_time(base_loan):
    """Principal component increases each month until the final balancing month."""
    principals = [r.principal_component for r in base_loan.schedule]
    for i in range(1, len(principals) - 1):
        assert principals[i] >= principals[i - 1] - 1e-9


# ---------------------------------------------------------------------------
# Totals & Effective Rates
# ---------------------------------------------------------------------------

def test_total_interest(base_loan):
    expected = sum(r.interest_component for r in base_loan.schedule)
    assert math.isclose(base_loan.total_interest, expected, rel_tol=1e-5)


def test_total_paid(base_loan):
    assert math.isclose(
        base_loan.total_paid,
        base_loan.principal + base_loan.total_interest,
        rel_tol=1e-6,
    )


def test_cumulative_principal_matches_principal(base_loan):
    assert math.isclose(
        base_loan.schedule[-1].cumulative_principal,
        base_loan.principal,
        rel_tol=1e-5,
    )


def test_effective_annual_rate(base_loan):
    """Verify effective annual rate equals (1 + r_monthly)^12 - 1."""
    expected_ear = (1.0 + 0.12 / 12) ** 12 - 1
    assert math.isclose(base_loan.effective_annual_rate, expected_ear, rel_tol=1e-5)


# ---------------------------------------------------------------------------
# Golden EMI value
# ---------------------------------------------------------------------------

def test_emi_golden_value(base_loan):
    """P=5, r=12%, n=60: EMI ≈ 0.111222 L (within 0.01 %)"""
    assert math.isclose(base_loan.emi, 0.111222, rel_tol=1e-3)


# ---------------------------------------------------------------------------
# Edge Cases & Input Validation
# ---------------------------------------------------------------------------

def test_one_month_loan():
    result = simulate_loan(principal=1.0, annual_interest_rate=0.12, term_months=1)
    assert len(result.schedule) == 1
    # Interest = 1 × 1% = 0.01; total = 1.01
    assert math.isclose(result.total_paid, 1.01, rel_tol=1e-6)


def test_simulate_loan_zero_rate():
    result = simulate_loan(principal=6.0, annual_interest_rate=0.0, term_months=12)
    assert len(result.schedule) == 12
    assert math.isclose(result.emi, 0.5, rel_tol=1e-6)
    assert math.isclose(result.total_interest, 0.0, abs_tol=1e-6)
    assert math.isclose(result.total_paid, 6.0, rel_tol=1e-6)
    assert math.isclose(result.effective_annual_rate, 0.0, abs_tol=1e-6)


@pytest.mark.parametrize("p,r,n", [
    (-5.0, 0.12, 60),
    (0.0, 0.12, 60),
    (5.0, -0.05, 60),
    (5.0, 0.12, 0),
    (5.0, 0.12, -12),
])
def test_invalid_inputs_raise(p, r, n):
    with pytest.raises(ValueError):
        calculate_emi(p, r, n)
    with pytest.raises(ValueError):
        simulate_loan(p, r, n)
