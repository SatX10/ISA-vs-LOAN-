"""
Pydantic v2 request / response schemas for the ISA-vs-Loan API.
"""

from __future__ import annotations
from datetime import date
from typing import Annotated, List, Literal, Optional
import math

from pydantic import BaseModel, ConfigDict, Field, model_validator

Amount = Annotated[float, Field(ge=0, le=10_000, allow_inf_nan=False)]
Rate = Annotated[float, Field(ge=0, le=0.60, allow_inf_nan=False)]
MonthlyAmount = Annotated[float, Field(ge=0, le=1_000_000_000, allow_inf_nan=False)]


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ISAInputs(BaseModel):
    """Parameters describing an Income Share Agreement contract."""

    model_config = ConfigDict(allow_inf_nan=False)

    principal: float = Field(
        ..., gt=0, le=10_000, description="Loan / ISA principal in ₹ lakhs."
    )
    income_share_pct: float = Field(
        ..., gt=0, le=50, description="Percentage of monthly income to pay (1-50)."
    )
    starting_income_lpa: float = Field(
        ..., gt=0, le=10_000, description="Projected gross annual income at graduation (₹ lakhs)."
    )
    trigger_threshold_lpa: float = Field(
        ..., ge=0, description="ISA payments begin once annual income ≥ this (₹ lakhs)."
    )
    max_multiple: float = Field(
        ..., ge=1.0, le=5.0,
        description="Total repayment cap as multiple of principal (e.g. 1.5 = 150%)."
    )
    term_months: int = Field(
        default=60, ge=12, le=240,
        description="ISA contract length in months."
    )
    annual_income_growth_rate: float = Field(
        default=0.08, ge=0, le=1.0,
        description="Annual income growth rate as decimal (e.g. 0.08 = 8%)."
    )
    monthly_payment_cap: Optional[float] = Field(
        default=None, gt=0,
        description="Optional hard ceiling on monthly payment (₹ lakhs)."
    )
    delay_months: int = Field(default=0, ge=0, le=24, description="Grace period before the ISA term.")
    job_delay_months: int = Field(default=0, ge=0, le=120)
    term_basis: Literal["elapsed", "paying"] = "elapsed"
    max_window_months: int = Field(default=360, ge=12, le=360)
    eligible_income_pct: float = Field(default=100, gt=0, le=100)
    income_overrides: dict[int, Amount] = Field(default_factory=dict, max_length=360)

    @model_validator(mode="after")
    def payment_cap_sanity(self) -> "ISAInputs":
        if self.term_basis == "paying" and self.max_window_months < self.term_months:
            raise ValueError("The repayment window must allow at least the specified number of paying months.")
        if any(not 1 <= month <= 384 for month in self.income_overrides):
            raise ValueError("Enter income overrides for months 1 through 384.")
        return self


class LoanInputs(BaseModel):
    """Parameters describing a traditional term loan."""

    model_config = ConfigDict(allow_inf_nan=False)

    principal: float = Field(..., gt=0, le=10_000, description="Net education funding in ₹ lakhs.")
    annual_interest_rate: float = Field(
        ..., ge=0, le=0.60,
        description="Annual interest rate as decimal (e.g. 0.12 = 12%)."
    )
    term_months: int = Field(
        ..., ge=1, le=360,
        description="Loan tenor in months."
    )
    upfront_fee: Amount = 0
    financed_cost: Amount = 0
    monthly_fee: Amount = 0
    withheld_fee: Amount = 0
    grace_months: int = Field(default=0, ge=0, le=120)
    grace_mode: Literal["deferred", "interest_only", "no_interest"] = "deferred"
    extra_monthly_payment: Amount = 0
    rate_changes: dict[int, Rate] = Field(default_factory=dict, max_length=120)
    disbursements: dict[int, Amount] = Field(default_factory=dict, max_length=120)

    @model_validator(mode="after")
    def validate_schedule(self) -> "LoanInputs":
        if any(not 1 <= month <= self.grace_months + self.term_months for month in self.rate_changes):
            raise ValueError("Rate changes must fall within the loan schedule.")
        if any(not 1 <= month <= self.grace_months for month in self.disbursements):
            raise ValueError("Later disbursements must fall within the grace period.")
        if sum(self.disbursements.values()) > self.principal + 1e-9:
            raise ValueError("Scheduled disbursements exceed the education funding amount.")
        return self

class CompareRequest(BaseModel):
    """Combined compare request."""

    isa: ISAInputs
    loan: LoanInputs
    monthly_budget_inr: MonthlyAmount | None = None
    take_home_inr: MonthlyAmount | None = None
    essential_expenses_inr: MonthlyAmount = 0
    other_debt_inr: MonthlyAmount = 0
    discount_rate: Rate = 0
    funding_date: date | None = Field(default=None, ge=date(1900, 1, 1), le=date(2200, 12, 31))

    @model_validator(mode="after")
    def matching_principals(self) -> "CompareRequest":
        if not math.isclose(self.isa.principal, self.loan.principal, rel_tol=0.01):
            raise ValueError(
                "ISA and Loan principals should match for a fair comparison "
                f"(got ISA={self.isa.principal}, Loan={self.loan.principal})."
            )
        return self


class ScenariosRequest(CompareRequest):
    incomes: list[float] = Field(default_factory=lambda: [6, 9, 12], min_length=1, max_length=12)

    @model_validator(mode="after")
    def valid_incomes(self) -> "ScenariosRequest":
        if any(not 0 < income <= 10_000 for income in self.incomes):
            raise ValueError("Scenario incomes must be positive and at most 10,000 LPA.")
        return self


class SensitivityRequest(CompareRequest):
    axis: Literal["growth", "cap"] = "growth"


class SavedComparisonRequest(BaseModel):
    contracts: list[CompareRequest] = Field(min_length=1, max_length=50)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class ISAMonthlyRowSchema(BaseModel):
    month: int
    annual_income: float
    monthly_income: float
    above_threshold: bool
    payment: float
    cumulative_paid: float
    remaining_cap: float
    status: Literal["grace", "below_threshold", "paid"] = "paid"


class ISAResultSchema(BaseModel):
    principal: float
    income_share_pct: float
    trigger_threshold_lpa: float
    max_multiple: float
    term_months: int
    annual_growth_rate: float
    total_cap: float
    delay_months: int
    schedule: List[ISAMonthlyRowSchema]
    total_paid: float
    months_paid: int
    months_to_payoff: Optional[int]
    effective_annual_rate: Optional[float]
    nominal_annual_rate: Optional[float]
    payment_cap_hit: bool
    end_reason: Literal["cap", "term", "window"] = "term"


class LoanAmortizationRowSchema(BaseModel):
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
    fee: float = 0
    disbursement: float = 0
    accrued_interest: float = 0
    annual_rate: float = 0


class LoanResultSchema(BaseModel):
    principal: float
    annual_interest_rate: float
    term_months: int
    emi: float
    total_paid: float
    total_interest: float
    effective_annual_rate: float | None
    schedule: List[LoanAmortizationRowSchema]
    upfront_fee: float = 0
    financed_cost: float = 0
    withheld_fee: float = 0
    regular_fees: float = 0
    capitalized_interest: float = 0
    initial_disbursement: float = 0


class ComparisonSummary(BaseModel):
    winner: Literal["ISA", "Loan", "Tie"]
    saving: float                     # positive → winning option saves this much
    delta: float                      # ISA repayment minus loan repayment
    isa_total_paid: float
    loan_total_paid: float
    isa_effective_rate: Optional[float]
    loan_effective_rate: float | None
    isa_months_to_payoff: Optional[int]
    isa_payment_cap_hit: bool
    never_pays: bool
    pays_less_than_fee: bool


class CompareResponse(BaseModel):
    isa: ISAResultSchema
    loan: LoanResultSchema
    summary: ComparisonSummary
    affordability: dict
    present_value: dict
    funding_date: date | None = None


class SaveContractRequest(CompareRequest):
    label: str = Field(..., min_length=1, max_length=120)


class SavedContract(BaseModel):
    id: int
    label: str
    isa_params: dict
    loan_params: dict
    created_at: str

