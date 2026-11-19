"""
GET /sensitivity — returns a 2-D sensitivity grid for the heatmap.
"""

from __future__ import annotations
from collections.abc import Callable
from math import isfinite
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Query

from app.limiter import limiter
from app.engine.scenarios import run_contract_sensitivity, run_sensitivity_grid
from app.schemas import SensitivityRequest

router = APIRouter(prefix="/sensitivity", tags=["sensitivity"])


def _parse_axis(
    raw: str | None, name: str, valid: Callable[[float], bool], expected: str
) -> list[float] | None:
    if raw is None:
        return None
    try:
        values = [float(part) for part in raw.split(",")]
        if len(values) <= 25 and all(isfinite(value) and valid(value) for value in values):
            return list(dict.fromkeys(values))
    except ValueError:
        pass
    raise HTTPException(status_code=422, detail=f"{name} must contain up to 25 comma-separated {expected}.")


@router.get("", response_model=dict[str, Any])
@limiter.limit("20/minute")
def get_sensitivity(
    request: Request,
    incomes: str | None = Query(
        default=None,
        description="Comma-separated income values in LPA, e.g. '6,9,12'. Defaults to 4..20.",
    ),
    rates: str | None = Query(
        default=None,
        description="Comma-separated annual interest rates as decimals, e.g. '0.10,0.12,0.14'.",
    ),
) -> dict[str, Any]:
    """
    Return a 2-D grid of (ISA total paid − Loan total paid) across income and interest rate axes.

    Negative values mean ISA is cheaper; positive values mean Loan is cheaper.
    """
    income_list = _parse_axis(incomes, "incomes", lambda value: 0 <= value <= 10_000, "LPA values between 0 and 10,000")
    rate_list = _parse_axis(rates, "rates", lambda value: 0 <= value <= 0.60, "rates between 0 and 0.60")
    return run_sensitivity_grid(income_values=income_list, rate_values=rate_list)


@router.post("")
@limiter.limit("20/minute")
def post_sensitivity(request: Request, body: SensitivityRequest) -> dict:
    return run_contract_sensitivity(body.isa.model_dump(), body.loan.model_dump(), body.axis)

