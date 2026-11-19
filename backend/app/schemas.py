"""
Pydantic v2 request / response schemas for the ISA-vs-Loan API.
"""

from __future__ import annotations
from typing import List, Literal, Optional
import math

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ISAInputs(BaseModel):
    """Parameters describing an Income Share Agreement contract."""

    model_config = ConfigDict(allow_inf_nan=False)

    principal: float = Field(
        ..., gt=0, description="Loan / ISA principal in ₹ lakhs."
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

    @model_validator(mode="after")
    def payment_cap_sanity(self) -> "ISAInputs":
        if self.monthly_payment_cap is not None:
            min_possible_payment = (self.income_share_pct / 100) * (self.trigger_threshold_lpa / 12)
            if self.monthly_payment_cap < min_possible_payment * 0.1:
                raise ValueError(
                    "monthly_payment_cap is extremely low relative to income_share_pct × trigger; "
                    "repayment may never complete."
                )
        return self


class LoanInputs(BaseModel):
    """Parameters describing a traditional term loan."""

    model_config = ConfigDict(allow_inf_nan=False)

    principal: float = Field(..., gt=0, description="Loan principal in ₹ lakhs.")
    annual_interest_rate: float = Field(
        ..., ge=0, le=0.60,
        description="Annual interest rate as decimal (e.g. 0.12 = 12%)."
    )
    term_months: int = Field(
        ..., ge=1, le=360,
        description="Loan tenor in months."
    )

class CompareRequest(BaseModel):
    """Combined compare request."""

    isa: ISAInputs
    loan: LoanInputs

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


class LoanAmortizationRowSchema(BaseModel):
    month: int
    opening_balance: float
    emi: float
    interest_component: float
    principal_component: float
    closing_balance: float
    cumulative_interest: float
    cumulative_principal: float


class LoanResultSchema(BaseModel):
    principal: float
    annual_interest_rate: float
    term_months: int
    emi: float
    total_paid: float
    total_interest: float
    effective_annual_rate: float
    schedule: List[LoanAmortizationRowSchema]


class ComparisonSummary(BaseModel):
    winner: Literal["ISA", "Loan", "Tie"]
    saving: float                     # positive → winning option saves this much
    delta: float                      # ISA repayment minus loan repayment
    isa_total_paid: float
    loan_total_paid: float
    isa_effective_rate: Optional[float]
    loan_effective_rate: float
    isa_months_to_payoff: Optional[int]
    isa_payment_cap_hit: bool
    never_pays: bool
    pays_less_than_fee: bool


class CompareResponse(BaseModel):
    isa: ISAResultSchema
    loan: LoanResultSchema
    summary: ComparisonSummary


class SaveContractRequest(CompareRequest):
    label: str = Field(..., min_length=1, max_length=120)


class SavedContract(BaseModel):
    id: int
    label: str
    isa_params: dict
    loan_params: dict
    created_at: str

