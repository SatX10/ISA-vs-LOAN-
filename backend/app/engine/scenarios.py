"""
Pre-defined scenario runner and sensitivity grid generator.

Scenarios
---------
Three standard income profiles (6, 9, 12 LPA) are run through both ISA and
Loan engines with canonical contract parameters.

Sensitivity Grid
----------------
A 2-D grid over income × annual_interest_rate is computed to power the
heatmap on the frontend. For each cell the grid stores the difference in
total repayment (ISA − Loan) so the UI can show where each option wins.
"""

from __future__ import annotations
from dataclasses import dataclass, asdict
from math import isclose
from collections.abc import Callable
from typing import Any, Dict, List

import numpy as np

from .isa import simulate_isa, ISAResult
from .loan import simulate_loan, LoanResult


# ---------------------------------------------------------------------------
# Canonical contract parameters
# ---------------------------------------------------------------------------
DEFAULT_ISA = dict(
    principal=5.0,                   # ₹ 5 lakhs
    income_share_pct=15.0,
    trigger_threshold_lpa=4.0,       # payments kick in above 4 LPA
    max_multiple=1.5,                # cap at 1.5× = ₹ 7.5 L
    term_months=60,
    annual_income_growth_rate=0.08,
)

DEFAULT_LOAN = dict(
    principal=5.0,
    annual_interest_rate=0.14,       # 14 % p.a.
    term_months=60,
)

SCENARIO_INCOMES = [6.0, 9.0, 12.0]   # LPA


@dataclass
class ScenarioResult:
    label: str                # e.g. "6 LPA"
    starting_income_lpa: float
    isa_total_paid: float
    isa_months_to_payoff: int | None
    isa_effective_rate: float | None
    isa_payment_cap_hit: bool
    loan_total_paid: float
    loan_total_interest: float
    loan_emi: float
    loan_effective_rate: float | None
    winner: str               # "ISA" | "Loan" | "Tie"
    saving: float             # positive → ISA is cheaper by this amount


def _run_scenario(income_lpa: float, isa_params: dict, loan: LoanResult) -> ScenarioResult:
    isa: ISAResult = simulate_isa(
        **{**isa_params, "starting_income_lpa": income_lpa},
    )

    saving = loan.total_paid - isa.total_paid
    if abs(saving) < 0.001:
        winner = "Tie"
    elif saving > 0:
        winner = "ISA"
    else:
        winner = "Loan"

    return ScenarioResult(
        label=f"{income_lpa:g} LPA",
        starting_income_lpa=income_lpa,
        isa_total_paid=isa.total_paid,
        isa_months_to_payoff=isa.months_to_payoff,
        isa_effective_rate=isa.effective_annual_rate,
        isa_payment_cap_hit=isa.payment_cap_hit,
        loan_total_paid=loan.total_paid,
        loan_total_interest=loan.total_interest,
        loan_emi=loan.emi,
        loan_effective_rate=loan.effective_annual_rate,
        winner=winner,
        saving=round(saving, 4),
    )


def run_predefined_scenarios() -> List[Dict[str, Any]]:
    """Return scenario results for 6, 9, 12 LPA income profiles."""
    return compare_scenarios(DEFAULT_ISA, DEFAULT_LOAN, SCENARIO_INCOMES)


def compare_scenarios(isa_params: dict, loan_params: dict, incomes: list[float]) -> list[dict]:
    loan = simulate_loan(**loan_params)
    return [asdict(_run_scenario(income, isa_params, loan)) for income in dict.fromkeys(incomes)]


def paying_month_ranges(terms: dict, upper: float, delta: Callable[[float], float]) -> list[dict]:
    """Split at income thresholds before finding matches within each continuous interval."""
    cuts = {0.0, upper}
    grace, window = terms.get("delay_months", 0), terms.get("max_window_months", 360)
    delay, overrides = terms.get("job_delay_months", 0), terms.get("income_overrides", {})
    share = terms.get("eligible_income_pct", 100) / 100
    growth = 1 + terms.get("annual_income_growth_rate", 0.08)
    threshold = terms["trigger_threshold_lpa"]
    for month in range(max(grace, delay) + 1, grace + window + 1):
        if month in overrides:
            continue
        cutoff = threshold / (share * growth ** ((month - delay - 1) // 12))
        if 0 < cutoff < upper:
            cuts.add(cutoff)

    def winner(value: float) -> str:
        return "Tie" if abs(value) <= 1e-5 else "ISA" if value < 0 else "Loan"

    regions = []
    ordered = sorted(cuts)
    for start, end in zip(ordered, ordered[1:]):
        epsilon = min((end - start) / 8, 1e-7 * max(1, start))
        low, high = start + epsilon, end - epsilon
        low_delta, high_delta = delta(low), delta(high)
        partitions = [start, end]
        for target in (-1e-5, 1e-5):
            if low_delta < target < high_delta:
                left, right = low, high
                for _ in range(45):
                    midpoint = (left + right) / 2
                    if delta(midpoint) < target:
                        left = midpoint
                    else:
                        right = midpoint
                partitions.append(right)
        partitions.sort()
        for lower, upper_bound in zip(partitions, partitions[1:]):
            outcome = winner(delta((lower + upper_bound) / 2))
            if regions and regions[-1]["winner"] == outcome:
                regions[-1]["to_lpa"] = upper_bound
            else:
                regions.append({"from_lpa": lower, "to_lpa": upper_bound, "winner": outcome})
    return regions


def find_break_even(isa_params: dict, loan_params: dict, upper_income: float = 100) -> dict:
    """Find the lowest matching salary, allowing for jumps and cap plateaus."""
    loan_total = simulate_loan(**loan_params, calculate_rate=False).total_paid

    def isa_total(income: float) -> float:
        return simulate_isa(
            **{**isa_params, "starting_income_lpa": income}, calculate_rate=False
        ).total_paid

    result = {
        "salary_lpa": None,
        "loan_total_paid": loan_total,
        "upper_income_lpa": upper_income,
    }
    def with_curve(outcome: dict, boundary: float | None = None) -> dict:
        plotted_limit = min(upper_income, max(20, 1.4 * max(boundary or 0, isa_params["starting_income_lpa"])))
        wages = {plotted_limit * i / 40 for i in range(41)}
        if boundary is not None:
            wages.update((max(0, boundary - 1e-6), boundary, min(upper_income, boundary + 1e-6)))
        for region in outcome.get("regions", []):
            edge = region["from_lpa"]
            if edge <= plotted_limit:
                wages.update((max(0, edge - 1e-6), edge, min(plotted_limit, edge + 1e-6)))
        return {**outcome, "curve": [
            {"salary_lpa": income, "isa_total": isa_total(income), "loan_total": loan_total}
            for income in sorted(wages)
        ]}
    if isa_params.get("term_basis") == "paying":
        regions = paying_month_ranges(isa_params, upper_income, lambda wage: isa_total(wage) - loan_total)
        last_boundary = regions[-1]["from_lpa"] if regions else None
        return with_curve({**result, "status": "salary_ranges", "regions": regions}, last_boundary)
    # ISA repayment is nondecreasing with salary. A trigger may jump over the
    # loan total, so verify the individual repayments after finding the boundary.
    if isa_total(upper_income) < loan_total:
        return with_curve({**result, "status": "isa_cheaper_throughout"})
    if isa_total(0) > loan_total:
        return with_curve({**result, "status": "loan_cheaper_throughout"})

    low, high = 0.0, upper_income
    for _ in range(60):
        midpoint = (low + high) / 2
        if isa_total(midpoint) < loan_total:
            low = midpoint
        else:
            high = midpoint

    isa_at_boundary = isa_total(high)
    if not isclose(isa_at_boundary, loan_total, rel_tol=0, abs_tol=0.00001):
        return with_curve({**result, "status": "threshold_jump", "boundary_lpa": high}, high)
    return with_curve({**result, "status": "match", "salary_lpa": high, "isa_total_paid": isa_at_boundary}, high)


# ---------------------------------------------------------------------------
# Sensitivity grid
# ---------------------------------------------------------------------------
INCOME_RANGE = list(np.round(np.arange(4.0, 20.1, 1.0), 1))   # 4..20 LPA
RATE_RANGE = list(np.round(np.arange(0.08, 0.201, 0.01), 3))   # 8..20 %


def run_contract_sensitivity(isa_params: dict, loan_params: dict, axis: str) -> dict:
    """Compare repayments and APR across salary and a second ISA input."""
    field = "annual_income_growth_rate" if axis == "growth" else "max_multiple"
    values = [i / 40 for i in range(13)] if axis == "growth" else [1 + i / 4 for i in range(13)]
    incomes = list(range(4, 21))
    loan_total = simulate_loan(**loan_params, calculate_rate=False).total_paid
    results = [
        [
            simulate_isa(**{**isa_params, "starting_income_lpa": income, field: value})
            for value in values
        ]
        for income in incomes
    ]
    base_isa_total = simulate_isa(**isa_params, calculate_rate=False).total_paid
    base_delta = base_isa_total - loan_total
    shocks = [
        ("Salary 25% lower", {**isa_params, "starting_income_lpa": isa_params["starting_income_lpa"] * 0.75}, loan_params),
        ("Salary 25% higher", {**isa_params, "starting_income_lpa": isa_params["starting_income_lpa"] * 1.25}, loan_params),
        ("First job 6 months later", {
            **isa_params,
            "job_delay_months": isa_params["job_delay_months"] + 6,
            "income_overrides": {month + 6: amount for month, amount in isa_params["income_overrides"].items()},
        }, loan_params),
        ("Loan rate 2 points higher", isa_params, {**loan_params, "annual_interest_rate": loan_params["annual_interest_rate"] + 0.02,
            "rate_changes": {month: rate + 0.02 for month, rate in loan_params["rate_changes"].items()}}),
        ("Upfront fee 1% of funding higher", isa_params, {
            **loan_params, "upfront_fee": loan_params["upfront_fee"] + loan_params["principal"] * 0.01,
        }),
    ]
    impacts = [
        {
            "label": label,
            "change_inr": round((simulate_isa(**isa, calculate_rate=False).total_paid
                                - simulate_loan(**loan, calculate_rate=False).total_paid - base_delta) * 100_000, 2),
        }
        for label, isa, loan in shocks
    ]
    return {
        "incomes": incomes,
        "axis": axis,
        "values": values,
        "grid": [[round(isa.total_paid - loan_total, 6) for isa in row] for row in results],
        "apr_grid": [[isa.effective_annual_rate for isa in row] for row in results],
        "impacts": sorted(impacts, key=lambda item: abs(item["change_inr"]), reverse=True),
    }


def run_sensitivity_grid(
    income_values: List[float] | None = None,
    rate_values: List[float] | None = None,
) -> Dict[str, Any]:
    """
    Compute a 2-D grid of (ISA total paid − Loan total paid).

    Positive value → ISA is MORE expensive at that cell.
    Negative value → ISA is CHEAPER (better for student).

    Returns
    -------
    dict with keys:
        incomes   : list of income values (rows)
        rates     : list of rate values (cols)
        grid      : 2-D list [income_idx][rate_idx] = difference
        winner    : 2-D list [income_idx][rate_idx] = "ISA" | "Loan" | "Tie"
    """
    incomes = income_values or INCOME_RANGE
    rates = rate_values or RATE_RANGE

    grid: List[List[float]] = []
    winner_grid: List[List[str]] = []
    loan_totals = [
        simulate_loan(**{**DEFAULT_LOAN, "annual_interest_rate": rate}).total_paid
        for rate in rates
    ]

    for income in incomes:
        isa_total = simulate_isa(starting_income_lpa=income, **DEFAULT_ISA).total_paid
        row_diff: List[float] = []
        row_winner: List[str] = []
        for loan_total in loan_totals:
            diff = isa_total - loan_total
            row_diff.append(round(diff, 4))
            if abs(diff) < 0.001:
                row_winner.append("Tie")
            elif diff < 0:
                row_winner.append("ISA")
            else:
                row_winner.append("Loan")
        grid.append(row_diff)
        winner_grid.append(row_winner)

    return {
        "incomes": incomes,
        "rates": rates,
        "grid": grid,
        "income_axis": incomes,
        "rate_axis": rates,
        "delta_matrix": grid,
        "winner": winner_grid,
        "meta": {
            "isa_params": DEFAULT_ISA,
            "loan_base_params": DEFAULT_LOAN,
            "note": "diff = ISA_total_paid − Loan_total_paid; negative means ISA is cheaper",
        },
    }

