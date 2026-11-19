"""
Pytest tests for the ISA simulation engine.

Golden values computed analytically:
  - 5 LPA principal, 15 % share, 9 LPA starting income, 4 LPA threshold,
    1.5× cap, 60-month term, 8 % YoY growth.
  - Month 1: monthly income = 9/12 = 0.75 L
              payment = 0.15 × 0.75 = 0.1125 L
  - Max total = 1.5 × 5 = 7.5 L → will be hit at some month.
"""

from __future__ import annotations
import math
import pytest

from app.engine.isa import simulate_isa, ISAMonthlyRow


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_isa():
    """Standard mid-income ISA scenario."""
    return simulate_isa(
        principal=5.0,
        income_share_pct=15.0,
        starting_income_lpa=9.0,
        trigger_threshold_lpa=4.0,
        max_multiple=1.5,
        term_months=60,
        annual_income_growth_rate=0.08,
    )


@pytest.fixture
def below_threshold_isa():
    """Income starts below trigger; first few months should have zero payments."""
    return simulate_isa(
        principal=5.0,
        income_share_pct=15.0,
        starting_income_lpa=3.0,          # below 4 LPA threshold
        trigger_threshold_lpa=4.0,
        max_multiple=1.5,
        term_months=60,
        annual_income_growth_rate=0.10,
    )


# ---------------------------------------------------------------------------
# Basic structure tests
# ---------------------------------------------------------------------------

def test_schedule_length(base_isa):
    """Schedule ends when cap is hit or term expires."""
    assert 1 <= len(base_isa.schedule) <= 60


def test_month_numbers_sequential(base_isa):
    for i, row in enumerate(base_isa.schedule):
        assert row.month == i + 1


def test_cumulative_paid_monotonic(base_isa):
    for i in range(1, len(base_isa.schedule)):
        assert base_isa.schedule[i].cumulative_paid >= base_isa.schedule[i - 1].cumulative_paid


# ---------------------------------------------------------------------------
# Golden-value tests (month 1)
# ---------------------------------------------------------------------------

def test_month1_monthly_income(base_isa):
    row: ISAMonthlyRow = base_isa.schedule[0]
    expected = 9.0 / 12
    assert math.isclose(row.monthly_income, expected, rel_tol=1e-5)


def test_month1_payment(base_isa):
    row: ISAMonthlyRow = base_isa.schedule[0]
    expected = (15.0 / 100) * (9.0 / 12)   # = 0.1125 L
    assert math.isclose(row.payment, expected, rel_tol=1e-5)


def test_month1_above_threshold(base_isa):
    assert base_isa.schedule[0].above_threshold is True


# ---------------------------------------------------------------------------
# Cap & payoff tests
# ---------------------------------------------------------------------------

def test_total_paid_does_not_exceed_cap(base_isa):
    cap = 1.5 * 5.0
    assert base_isa.total_paid <= cap + 1e-6


def test_payment_cap_hit(base_isa):
    """9 LPA income well above threshold; 15% share should hit cap before term."""
    assert base_isa.payment_cap_hit is True


def test_months_to_payoff_set(base_isa):
    assert base_isa.months_to_payoff is not None
    assert base_isa.months_to_payoff <= 60


# ---------------------------------------------------------------------------
# Below-threshold scenario
# ---------------------------------------------------------------------------

def test_below_threshold_zero_payments_initially(below_threshold_isa):
    """With 3 LPA income and 4 LPA trigger, first month must have zero payment."""
    assert below_threshold_isa.schedule[0].payment == pytest.approx(0.0)
    assert below_threshold_isa.schedule[0].above_threshold is False


def test_below_threshold_eventually_pays(below_threshold_isa):
    """Income grows at 10 % YoY; should eventually cross 4 LPA threshold."""
    payments = [r.payment for r in below_threshold_isa.schedule]
    assert any(p > 0 for p in payments), "Expected at least one non-zero payment"


# ---------------------------------------------------------------------------
# Edge case: zero growth rate
# ---------------------------------------------------------------------------

def test_zero_growth():
    result = simulate_isa(
        principal=5.0,
        income_share_pct=15.0,
        starting_income_lpa=9.0,
        trigger_threshold_lpa=4.0,
        max_multiple=1.5,
        term_months=60,
        annual_income_growth_rate=0.0,
    )
    # Every month should have same income
    incomes = [r.annual_income for r in result.schedule]
    assert all(math.isclose(inc, 9.0, rel_tol=1e-6) for inc in incomes)


# ---------------------------------------------------------------------------
# Effective rate is a valid number
# ---------------------------------------------------------------------------

def test_effective_rate_finite(base_isa):
    assert math.isfinite(base_isa.effective_annual_rate)
    assert base_isa.effective_annual_rate > 0


def test_grace_period_delays_identical_payments_and_lowers_positive_rate():
    params = dict(principal=3, income_share_pct=15, starting_income_lpa=12,
                  trigger_threshold_lpa=5, max_multiple=1.5, term_months=36,
                  annual_income_growth_rate=0)
    immediate = simulate_isa(**params)
    delayed = simulate_isa(**params, delay_months=6)

    assert [row.payment for row in delayed.schedule[:6]] == [0] * 6
    assert [row.payment for row in delayed.schedule[6:]] == [row.payment for row in immediate.schedule]
    assert delayed.months_to_payoff == immediate.months_to_payoff + 6
    assert 0 < delayed.effective_annual_rate < immediate.effective_annual_rate


def test_income_crosses_trigger_on_salary_anniversary():
    result = simulate_isa(
        principal=5, income_share_pct=15, starting_income_lpa=4,
        trigger_threshold_lpa=5, max_multiple=1.5, term_months=24,
        annual_income_growth_rate=0.25,
    )
    assert all(row.payment == 0 for row in result.schedule[:12])
    assert result.schedule[12].annual_income == 5
    assert result.schedule[12].payment == 0.0625

