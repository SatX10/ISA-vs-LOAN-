"""Summarize borrower cash flows for comparisons, reports, and the planner."""

from collections.abc import Iterable
from calendar import monthrange
from datetime import date

from .isa import ISAResult
from .loan import LoanResult

INR_PER_LAKH = 100_000


def inr(value: float) -> float:
    return round(value * INR_PER_LAKH, 2)


def repayment_metrics(
    payments: Iterable[tuple[int, float]],
    total: float,
    budget: float | None,
    upfront: float = 0,
) -> dict:
    rows = [(month, inr(payment)) for month, payment in payments if payment > 0]
    over_budget = [(month, payment - budget) for month, payment in rows if budget is not None and payment > budget]
    peak_month, peak = max(rows, key=lambda row: row[1], default=(None, 0))
    return {
        "total_inr": inr(total),
        "upfront_inr": inr(upfront),
        "peak_inr": peak,
        "peak_month": peak_month,
        "first_payment_month": rows[0][0] if rows else None,
        "last_payment_month": rows[-1][0] if rows else None,
        "first_over_budget_month": over_budget[0][0] if over_budget else None,
        "months_over_budget": len(over_budget) if budget is not None else None,
        "largest_shortfall_inr": round(max((shortfall for _, shortfall in over_budget), default=0), 2)
        if budget is not None else None,
        "fits_budget": not over_budget if budget is not None else None,
    }


def isa_payments(isa: ISAResult) -> Iterable[tuple[int, float]]:
    return ((row.month, row.payment) for row in isa.schedule)


def loan_payments(loan: LoanResult) -> Iterable[tuple[int, float]]:
    return ((row.month, row.payment) for row in loan.schedule)


def after_essentials(body) -> float | None:
    if body.take_home_inr is None:
        return None
    return round(body.take_home_inr - body.essential_expenses_inr - body.other_debt_inr, 2)


def comparison_budget(body) -> float | None:
    budget = body.monthly_budget_inr
    available = after_essentials(body)
    if available is None:
        return budget
    remaining = max(0, available)
    return min(remaining, budget) if budget is not None else remaining


def present_value(flows: Iterable[tuple[int, float]], effective_rate: float) -> float:
    return inr(sum(value / (1 + effective_rate) ** (month / 12) for month, value in flows))


def month_date(start: date | None, months: int) -> str:
    if start is None:
        return ""
    year_offset, index = divmod(start.month - 1 + months, 12)
    year, month = start.year + year_offset, index + 1
    return date(year, month, min(start.day, monthrange(year, month)[1])).isoformat()
