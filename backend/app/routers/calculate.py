"""
POST /calculate  — compare ISA vs Loan for given inputs.
"""

from __future__ import annotations
from dataclasses import asdict

from fastapi import APIRouter, Request

from app.limiter import limiter
from app.schemas import (
    CompareRequest,
    CompareResponse,
    ISAResultSchema,
    LoanResultSchema,
    ComparisonSummary,
    SavedComparisonRequest,
)
from app.engine.isa import simulate_isa
from app.engine.loan import simulate_loan
from app.engine.comparison import after_essentials, comparison_budget, inr, isa_payments, loan_payments, present_value, repayment_metrics
from app.engine.scenarios import find_break_even

router = APIRouter(prefix="/calculate", tags=["calculate"])


@router.post("", response_model=CompareResponse)
@limiter.limit("30/minute")
def compare(request: Request, body: CompareRequest) -> CompareResponse:
    """
    Run both ISA and Loan simulations and return a side-by-side comparison.
    """
    isa_params = body.isa.model_dump()
    loan_params = body.loan.model_dump()

    isa_result = simulate_isa(**isa_params)
    loan_result = simulate_loan(**loan_params)
    budget = comparison_budget(body)
    isa_metrics = repayment_metrics(isa_payments(isa_result), isa_result.total_paid, budget)
    loan_metrics = repayment_metrics(loan_payments(loan_result), loan_result.total_paid, budget, loan_result.upfront_fee)
    available = after_essentials(body)
    if available is not None:
        for metrics in (isa_metrics, loan_metrics):
            metrics["left_after_peak_inr"] = round(available - metrics["peak_inr"], 2)
    rate = body.discount_rate
    isa_value = present_value(isa_payments(isa_result), rate)
    loan_value = present_value(loan_payments(loan_result), rate) + inr(loan_result.upfront_fee)
    loan_funding = present_value(((row.month, row.disbursement) for row in loan_result.schedule), rate) + inr(loan_result.initial_disbursement)

    # Build winner summary
    saving = loan_result.total_paid - isa_result.total_paid
    if abs(saving) < 0.001:
        winner = "Tie"
    elif saving > 0:
        winner = "ISA"
    else:
        winner = "Loan"

    summary = ComparisonSummary(
        winner=winner,
        saving=round(abs(saving), 4),
        delta=round(-saving, 6),
        isa_total_paid=isa_result.total_paid,
        loan_total_paid=loan_result.total_paid,
        isa_effective_rate=isa_result.effective_annual_rate,
        loan_effective_rate=loan_result.effective_annual_rate,
        isa_months_to_payoff=isa_result.months_to_payoff,
        isa_payment_cap_hit=isa_result.payment_cap_hit,
        never_pays=isa_result.months_paid == 0,
        pays_less_than_fee=isa_result.total_paid < isa_result.principal,
    )

    return CompareResponse(
        isa=ISAResultSchema(**asdict(isa_result)),
        loan=LoanResultSchema(**asdict(loan_result)),
        summary=summary,
        affordability={"budget_inr": budget, "isa": isa_metrics, "loan": loan_metrics},
        present_value={
            "discount_rate": rate, "isa_repayment_inr": isa_value, "loan_repayment_inr": loan_value,
            "isa_net_cost_inr": round(isa_value - inr(isa_result.principal), 2),
            "loan_net_cost_inr": round(loan_value - loan_funding, 2),
        },
        funding_date=body.funding_date,
    )


break_even_router = APIRouter(tags=["calculate"])


@break_even_router.post("/breakeven")
@limiter.limit("20/minute")
def break_even(request: Request, body: CompareRequest) -> dict:
    """Return the first starting salary at which repayments match, if any."""
    return find_break_even(body.isa.model_dump(), body.loan.model_dump())


@break_even_router.post("/contract-comparison")
@limiter.limit("10/minute")
def contract_comparison(request: Request, body: SavedComparisonRequest) -> list[dict]:
    """Return repayment totals in the original order for a set of saved contracts."""
    totals = []
    for contract in body.contracts:
        isa = simulate_isa(**contract.isa.model_dump(), calculate_rate=False)
        loan = simulate_loan(**contract.loan.model_dump(), calculate_rate=False)
        totals.append({"isa_total_paid": isa.total_paid, "loan_total_paid": loan.total_paid})
    return totals

