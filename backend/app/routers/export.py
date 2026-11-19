"""
GET /export/csv      — download ISA vs Loan comparison as a CSV file.
POST /contracts      — save a named contract to SQLite.
GET  /contracts      — list saved contracts.
DELETE /contracts/{id} — delete a saved contract.
"""

from __future__ import annotations
import csv
import io
import json
from dataclasses import asdict
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.limiter import limiter
from app.schemas import CompareRequest, SaveContractRequest, SavedContract
from app.engine.isa import simulate_isa
from app.engine.loan import simulate_loan
from app import db

router = APIRouter(tags=["export"])
contracts_router = APIRouter(tags=["contracts"])


@router.post("/export/csv")
@limiter.limit("10/minute")
async def export_csv(request: Request, body: CompareRequest) -> StreamingResponse:
    """
    Run both simulations and stream the combined amortization schedule as CSV.
    Columns: month, isa_payment, isa_cumulative, loan_emi, loan_interest,
             loan_principal, loan_closing_balance.
    """
    isa_params = body.isa.model_dump()
    loan_params = body.loan.model_dump()

    isa_result = simulate_isa(**isa_params)
    loan_result = simulate_loan(**loan_params)

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "month",
        "isa_annual_income_lpa",
        "isa_above_threshold",
        "isa_payment",
        "isa_cumulative_paid",
        "isa_remaining_cap",
        "loan_emi",
        "loan_interest_component",
        "loan_principal_component",
        "loan_closing_balance",
        "loan_cumulative_interest",
    ])

    max_months = max(len(isa_result.schedule), len(loan_result.schedule))

    for i in range(max_months):
        isa_row = isa_result.schedule[i] if i < len(isa_result.schedule) else None
        loan_row = loan_result.schedule[i] if i < len(loan_result.schedule) else None

        writer.writerow([
            i + 1,
            isa_row.annual_income if isa_row else "",
            isa_row.above_threshold if isa_row else "",
            isa_row.payment if isa_row else "",
            isa_row.cumulative_paid if isa_row else "",
            isa_row.remaining_cap if isa_row else "",
            loan_row.emi if loan_row else "",
            loan_row.interest_component if loan_row else "",
            loan_row.principal_component if loan_row else "",
            loan_row.closing_balance if loan_row else "",
            loan_row.cumulative_interest if loan_row else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=isa_vs_loan.csv"},
    )


# ---------------------------------------------------------------------------
# Saved contracts CRUD
# ---------------------------------------------------------------------------

@contracts_router.post("/contracts", response_model=Dict[str, Any], status_code=201)
@limiter.limit("20/minute")
async def save_contract(request: Request, body: SaveContractRequest) -> Dict[str, Any]:
    """Save a labelled ISA+Loan contract configuration."""
    db.init_db()
    contract_id = db.save_contract(
        label=body.label,
        isa_params=body.isa.model_dump(),
        loan_params=body.loan.model_dump(),
    )
    record = db.get_contract(contract_id)
    if record is None:
        raise HTTPException(status_code=500, detail="Failed to retrieve saved contract.")
    return record


@contracts_router.get("/contracts", response_model=List[Dict[str, Any]])
@limiter.limit("60/minute")
async def list_contracts(
    request: Request, limit: int = 50, offset: int = 0
) -> List[Dict[str, Any]]:
    """List saved contracts (newest first)."""
    db.init_db()
    return db.list_contracts(limit=limit, offset=offset)


@contracts_router.get("/contracts/{contract_id}", response_model=Dict[str, Any])
@limiter.limit("60/minute")
async def get_contract(request: Request, contract_id: int) -> Dict[str, Any]:
    """Retrieve a single saved contract by ID."""
    db.init_db()
    record = db.get_contract(contract_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")
    return record


@contracts_router.delete("/contracts/{contract_id}", response_model=Dict[str, Any])
@limiter.limit("20/minute")
async def delete_contract(request: Request, contract_id: int) -> Dict[str, Any]:
    """Delete a saved contract."""
    db.init_db()
    deleted = db.delete_contract(contract_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found.")
    return {"deleted": True, "id": contract_id}

