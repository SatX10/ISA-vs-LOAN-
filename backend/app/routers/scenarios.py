"""
GET /scenarios — returns pre-computed results for the 3 standard income profiles.
"""

from __future__ import annotations
from typing import Any, Dict, List

from fastapi import APIRouter, Request

from app.limiter import limiter
from app.engine.scenarios import compare_scenarios, run_predefined_scenarios
from app.schemas import ScenariosRequest

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=List[Dict[str, Any]])
@limiter.limit("60/minute")
async def get_scenarios(request: Request) -> List[Dict[str, Any]]:
    """
    Return pre-computed ISA vs Loan comparison for 6, 9, and 12 LPA income profiles.
    """
    return run_predefined_scenarios()


@router.post("")
@limiter.limit("30/minute")
def post_scenarios(request: Request, body: ScenariosRequest) -> list[dict]:
    return compare_scenarios(body.isa.model_dump(), body.loan.model_dump(), body.incomes)

