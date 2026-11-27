"""An account-scoped spending ledger."""

from contextlib import contextmanager
from datetime import date
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, StringConstraints

from app.routers.accounts import COOKIE, accounts_enabled, check_origin, private_response

router = APIRouter(prefix="/auth/expenses", tags=["accounts"])
FIELDS = "id, description, category, amount_paise, spent_on"
PAGE_SIZE = 25


class Expense(BaseModel):
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    amount_paise: Annotated[int, Field(strict=True, gt=0, le=1_000_000_000)]
    category: Literal["tuition", "materials", "living", "travel", "repayment", "other"]
    spent_on: Annotated[date, Field(ge=date(1900, 1, 1), lt=date(9999, 1, 1))]


OfferId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,100}$")]


class LoanPayment(Expense):
    category: Literal["repayment"] = "repayment"
    repayment_month: int = Field(ge=1, le=480)


@contextmanager
def own_expenses(request):
    store = accounts_enabled(request)
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sign in to manage your expenses.")
    store.initialize()
    with store.connection() as connection:
        account_id = store.session_account(connection, token)
        if not account_id:
            raise HTTPException(401, "Sign in to manage your expenses.")
        yield store, connection, account_id


@router.get("")
def list_expenses(
    request: Request, response: Response,
    month: Annotated[str, Query(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$")],
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
):
    try:
        start = date.fromisoformat(f"{month}-01")
        end = date(start.year + start.month // 12, start.month % 12 + 1, 1)
    except ValueError:
        raise HTTPException(422, "Choose a valid month.") from None
    private_response(response)
    with own_expenses(request) as (store, connection, account_id):
        scope = "WHERE account_id = ? AND spent_on >= ? AND spent_on < ?"
        params = (account_id, start.isoformat(), end.isoformat())
        groups = store.query(
            connection, f"SELECT category, SUM(amount_paise) AS total_paise, COUNT(*) AS entries "
            f"FROM account_expenses {scope} GROUP BY category ORDER BY total_paise DESC, category",
            *params,
        ).fetchall()
        rows = store.query(
            connection, f"SELECT {FIELDS} FROM account_expenses {scope} "
            "ORDER BY spent_on DESC, id DESC LIMIT ? OFFSET ?",
            *params, PAGE_SIZE, (page - 1) * PAGE_SIZE,
        ).fetchall()
        return {
            "expenses": [dict(row) for row in rows],
            "categories": [dict(row) for row in groups],
            "total_paise": sum(row["total_paise"] for row in groups),
            "entry_count": sum(row["entries"] for row in groups),
            "page_size": PAGE_SIZE,
        }


@router.post("", status_code=201, dependencies=[Depends(check_origin)])
def add_expense(request: Request, response: Response, body: Expense):
    private_response(response)
    with own_expenses(request) as (store, connection, account_id):
        expense_id = insert_expense(store, connection, account_id, body)
    return {"id": expense_id}


def insert_expense(store, connection, account_id, body):
    expense_id = str(uuid4())
    store.query(
        connection, "INSERT INTO account_expenses (id, account_id, description, category, amount_paise, spent_on) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        expense_id, account_id, body.description, body.category, body.amount_paise, body.spent_on.isoformat(),
    )
    return expense_id


@router.get("/repayments/{offer_id}")
def get_loan_payments(request: Request, response: Response, offer_id: OfferId):
    private_response(response)
    with own_expenses(request) as (store, connection, account_id):
        rows = store.query(
            connection, "SELECT e.id, e.spent_on AS date, e.amount_paise, l.repayment_month AS month "
            "FROM expense_repayment_links l JOIN account_expenses e ON e.id = l.expense_id "
            "WHERE e.account_id = ? AND l.offer_id = ? AND e.category = 'repayment' ORDER BY l.repayment_month, e.spent_on, e.id",
            account_id, offer_id,
        ).fetchall()
    return [{"id": row["id"], "date": row["date"], "month": row["month"], "value": row["amount_paise"] / 100} for row in rows]


@router.post("/repayments/{offer_id}", status_code=201, dependencies=[Depends(check_origin)])
def add_loan_payment(request: Request, response: Response, offer_id: OfferId, body: LoanPayment):
    private_response(response)
    with own_expenses(request) as (store, connection, account_id):
        expense_id = insert_expense(store, connection, account_id, body)
        store.query(connection, "INSERT INTO expense_repayment_links (expense_id, offer_id, repayment_month) VALUES (?, ?, ?)",
                    expense_id, offer_id, body.repayment_month)
    return {"id": expense_id}


@router.patch("/{expense_id}", dependencies=[Depends(check_origin)])
def edit_expense(request: Request, response: Response, expense_id: UUID, body: Expense):
    private_response(response)
    with own_expenses(request) as (store, connection, account_id):
        result = store.query(
            connection, "UPDATE account_expenses SET description = ?, category = ?, amount_paise = ?, spent_on = ? "
            "WHERE id = ? AND account_id = ?",
            body.description, body.category, body.amount_paise, body.spent_on.isoformat(), str(expense_id), account_id,
        )
        if result.rowcount != 1:
            raise HTTPException(404, "Expense not found.")
        if body.category != "repayment":
            store.query(connection, "DELETE FROM expense_repayment_links WHERE expense_id = ?", str(expense_id))
    return {"id": str(expense_id)}


@router.delete("/{expense_id}", status_code=204, dependencies=[Depends(check_origin)])
def remove_expense(request: Request, expense_id: UUID):
    with own_expenses(request) as (store, connection, account_id):
        result = store.query(
            connection, "DELETE FROM account_expenses WHERE id = ? AND account_id = ?", str(expense_id), account_id,
        )
        if result.rowcount != 1:
            raise HTTPException(404, "Expense not found.")
    response = Response(status_code=204)
    private_response(response)
    return response
