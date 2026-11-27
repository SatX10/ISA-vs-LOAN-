"""Compare a set of independent education offers against one funding goal."""

import io
from datetime import date
from itertools import zip_longest
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from starlette.concurrency import run_in_threadpool

from app.engine.comparison import INR_PER_LAKH, comparison_budget, inr, isa_payments, loan_payments, month_date, repayment_metrics
from app.engine.isa import simulate_isa
from app.engine.loan import simulate_loan
from app.limiter import limiter
from app.routers.accounts import check_origin
from app.schemas import Amount, ISAInputs, LoanInputs, MonthlyAmount, Rate

router = APIRouter(prefix="/portfolio", tags=["portfolio"])
MAX_QUOTE_BYTES = 5 * 1024 * 1024
MAX_QUOTE_PAGES = 20
MAX_QUOTE_TEXT = 40_000


class ISAOffer(BaseModel):
    kind: Literal["isa"]
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=120)
    terms: ISAInputs


class LoanOffer(BaseModel):
    kind: Literal["loan"]
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=120)
    terms: LoanInputs
    foreign_currency: bool = False
    funding_date: date | None = Field(default=None, ge=date(1900, 1, 1), le=date(2100, 12, 31))


class PortfolioRequest(BaseModel):
    funding_goal_inr: MonthlyAmount
    grants_inr: MonthlyAmount = 0
    savings_inr: MonthlyAmount = 0
    family_contribution_inr: MonthlyAmount = 0
    monthly_budget_inr: MonthlyAmount | None = None
    take_home_inr: MonthlyAmount | None = None
    essential_expenses_inr: MonthlyAmount = 0
    other_debt_inr: MonthlyAmount = 0
    expected_salary_lpa: Amount
    lower_salary_lpa: Amount
    higher_salary_lpa: Amount
    extra_job_delay_months: int = Field(default=6, ge=0, le=120)
    rate_shock: Rate = 0.02
    fx_shock: Rate = 0.10
    offers: list[ISAOffer | LoanOffer] = Field(min_length=1, max_length=12)
    bundle_ids: list[str] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def valid_cases(self):
        if not self.lower_salary_lpa <= self.expected_salary_lpa <= self.higher_salary_lpa:
            raise ValueError("Enter starting salaries in lower, expected, and higher order.")
        offer_ids = {offer.id for offer in self.offers}
        if len(offer_ids) != len(self.offers) or "combined-offers" in offer_ids:
            raise ValueError("Offer identifiers must be distinct.")
        if self.bundle_ids and (
            len(set(self.bundle_ids)) != len(self.bundle_ids)
            or len(self.bundle_ids) < 2
            or not set(self.bundle_ids) <= offer_ids
        ):
            raise ValueError("Choose two to four different saved offers to combine.")
        if any(not 0 < offer.terms.principal <= 10_000 for offer in self.offers):
            raise ValueError("Each offer must fund a positive amount of up to ₹100 crore.")
        return self


def stress_isa(offer: ISAOffer, body: PortfolioRequest):
    terms = offer.terms.model_dump()
    base_delay = terms["job_delay_months"]
    assumptions = {
        "expected": (body.expected_salary_lpa, base_delay),
        "lower": (body.lower_salary_lpa, base_delay),
        "higher": (body.higher_salary_lpa, base_delay),
        "job_delay": (body.expected_salary_lpa, base_delay + body.extra_job_delay_months),
    }
    results = {}
    schedule = []
    for name, (salary, delay) in assumptions.items():
        changed = {"starting_income_lpa": salary, "job_delay_months": delay}
        if name == "job_delay":
            changed["income_overrides"] = {
                month + body.extra_job_delay_months: value for month, value in terms["income_overrides"].items()
            }
        result = simulate_isa(**(terms | changed), calculate_rate=False)
        results[name] = repayment_metrics(isa_payments(result), result.total_paid, body.monthly_budget_inr)
        results[name]["end_reason"] = result.end_reason
        if name == "expected":
            schedule = [inr(row.payment) for row in result.schedule]
    return results, schedule


def stress_loan(offer: LoanOffer, body: PortfolioRequest):
    terms = offer.terms.model_dump()
    base = simulate_loan(**terms, calculate_rate=False)
    metrics = repayment_metrics(loan_payments(base), base.total_paid, body.monthly_budget_inr, base.upfront_fee)
    stressed = simulate_loan(**(terms | {
        "annual_interest_rate": terms["annual_interest_rate"] + body.rate_shock,
        "rate_changes": {month: rate + body.rate_shock for month, rate in terms["rate_changes"].items()},
    }), calculate_rate=False)
    results = {
        **dict.fromkeys(("expected", "lower", "higher", "job_delay"), metrics),
        "rate_shock": repayment_metrics(loan_payments(stressed), stressed.total_paid, body.monthly_budget_inr, stressed.upfront_fee),
    }
    if offer.foreign_currency:
        factor = 1 + body.fx_shock
        results["fx_shock"] = repayment_metrics(
            ((row.month, row.payment * factor) for row in base.schedule),
            base.upfront_fee + (base.total_paid - base.upfront_fee) * factor,
            body.monthly_budget_inr, base.upfront_fee,
        )
    dates = [month_date(offer.funding_date, row.month) for row in base.schedule]
    balances = [inr(row.closing_balance) for row in base.schedule]
    return results, [inr(row.payment) for row in base.schedule], dates, balances


@router.post("")
@limiter.limit("20/minute")
def compare_portfolio(request: Request, body: PortfolioRequest) -> dict:
    body = body.model_copy(update={"monthly_budget_inr": comparison_budget(body)})
    cash = body.grants_inr + body.savings_inr + body.family_contribution_inr
    needed = max(0, body.funding_goal_inr - cash)
    rows = []
    for offer in body.offers:
        tracking = {}
        if isinstance(offer, ISAOffer):
            cases, schedule = stress_isa(offer, body)
        else:
            cases, schedule, dates, balances = stress_loan(offer, body)
            tracking = {"payment_dates": dates, "scheduled_balances_inr": balances}
        funding = inr(offer.terms.principal)
        rows.append({
            "id": offer.id, "label": offer.label, "kind": offer.kind, "funded_inr": funding,
            "remaining_gap_inr": round(max(0, needed - funding), 2),
            "extra_funding_inr": round(max(0, funding - needed), 2),
            "cases": cases, "monthly_payments_inr": schedule, **tracking,
        })
    if body.bundle_ids:
        bundled = [row for row in rows if row["id"] in body.bundle_ids]
        funding = sum(row["funded_inr"] for row in bundled)
        total = sum(row["cases"]["expected"]["total_inr"] for row in bundled)
        upfront = sum(row["cases"]["expected"]["upfront_inr"] for row in bundled)
        schedules = [row["monthly_payments_inr"] for row in bundled]
        schedule = [round(sum(payments), 2) for payments in zip_longest(*schedules, fillvalue=0)]
        metrics = repayment_metrics(
            ((month, payment / INR_PER_LAKH) for month, payment in enumerate(schedule, 1)),
            total / INR_PER_LAKH, body.monthly_budget_inr, upfront / INR_PER_LAKH,
        )
        rows.append({
            "id": "combined-offers", "label": "Combined financing", "kind": "bundle", "funded_inr": funding,
            "remaining_gap_inr": round(max(0, needed - funding), 2),
            "extra_funding_inr": round(max(0, funding - needed), 2),
            "cases": {"expected": metrics}, "monthly_payments_inr": schedule,
        })
    return {"cash_inr": cash, "funding_needed_inr": needed, "budget_inr": body.monthly_budget_inr, "offers": rows}


def pdf_text(raw: bytes) -> str:
    if not raw.startswith(b"%PDF-"):
        raise HTTPException(422, "Choose a valid PDF file.")
    try:
        reader = PdfReader(io.BytesIO(raw), strict=True)
        if reader.is_encrypted:
            raise HTTPException(422, "Unlock the PDF before reading it here.")
        if len(reader.pages) > MAX_QUOTE_PAGES:
            raise HTTPException(413, "Choose a PDF with no more than 20 pages.")
        pieces = []
        remaining = MAX_QUOTE_TEXT
        for page in reader.pages:
            piece = (page.extract_text() or "")[:remaining]
            pieces.append(piece)
            remaining -= len(piece) + 1
            if remaining <= 0:
                break
        text = "\n".join(pieces).strip()
    except (PdfReadError, ValueError, TypeError, KeyError, IndexError, RecursionError) as exc:
        raise HTTPException(422, "This PDF could not be read. Paste the relevant terms instead.") from exc
    if not text:
        raise HTTPException(422, "No selectable text found. Paste the terms from the quote.")
    return text


@router.post("/quote-text", dependencies=[Depends(check_origin)])
@limiter.limit("8/minute")
async def read_quote_pdf(request: Request) -> dict:
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/pdf":
        raise HTTPException(415, "Upload a PDF file.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_QUOTE_BYTES:
            raise HTTPException(413, "Choose a PDF no larger than 5 MB.")
        body.extend(chunk)
    return {"text": await run_in_threadpool(pdf_text, bytes(body))}
