"""Account workspaces and private, read-only report sharing."""

import secrets
import time
from contextlib import contextmanager
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.accounts import session_digest
from app.limiter import limiter
from app.routers.accounts import COOKIE, SignIn, accounts_enabled, check_origin, private_response

router = APIRouter(prefix="/auth/workspace", tags=["accounts"])
CODE_LIFETIME_SECONDS = 30 * 60
MAX_SENT_REPORTS = 20
REPORT_READ_LIMIT = 50
INVITE_SECONDS = 7 * 24 * 60 * 60

Identifier = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,100}$")]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
DateText = Annotated[str, StringConstraints(pattern=r"^(?:[0-9]{4}-[0-9]{2}-[0-9]{2})?$")]
InputText = Annotated[str, StringConstraints(max_length=16000)]
InputNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]
InputKey = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
INRAmount = Annotated[float, Field(ge=0, le=100_000_000_000_000)]
Scenario = Literal["expected", "lower", "higher", "job_delay", "rate_shock", "fx_shock"]


class WorkspaceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SavedOffer(WorkspaceModel):
    id: Identifier
    kind: Literal["isa", "loan"]
    label: Label
    date: DateText = ""
    note: str = Field(default="", max_length=240)
    inputs: dict[InputKey, InputNumber | InputText | None] = Field(max_length=50)
    version: int = Field(default=1, ge=1, le=1_000_000)
    original: Identifier | None = None
    statement_balance_inr: INRAmount | None = None
    statement_date: DateText = ""


class SavedPayment(WorkspaceModel):
    id: Identifier
    offerId: Identifier
    month: int = Field(ge=1, le=480)
    value: Annotated[float, Field(gt=0, le=1_000_000_000)]
    date: DateText = ""


class WorkspaceSettings(WorkspaceModel):
    # Number inputs store strings while the user is editing.
    goal: InputNumber | InputText
    grants: InputNumber | InputText
    savings: InputNumber | InputText
    family: InputNumber | InputText
    budget: InputNumber | InputText
    expected: InputNumber | InputText
    lower: InputNumber | InputText
    higher: InputNumber | InputText
    delay: InputNumber | InputText
    rateShock: InputNumber | InputText
    fxShock: InputNumber | InputText
    takeHome: InputNumber | InputText = ""
    essentials: InputNumber | InputText = ""
    otherDebt: InputNumber | InputText = ""


class ReportTerms(WorkspaceModel):
    duration_months: int = Field(ge=1, le=360)
    rate_percent: float | None = Field(default=None, ge=0, le=60, allow_inf_nan=False)
    share_percent: float | None = Field(default=None, ge=0, le=50, allow_inf_nan=False)
    cap_multiple: float | None = Field(default=None, ge=1, le=5, allow_inf_nan=False)
    grace_months: int | None = Field(default=None, ge=0, le=120)
    upfront_fee_inr: INRAmount | None = None
    monthly_fee_inr: INRAmount | None = None


class ReportRow(WorkspaceModel):
    kind: Literal["isa", "loan", "bundle"]
    label: Label
    funded_inr: INRAmount
    remaining_gap_inr: INRAmount
    extra_funding_inr: INRAmount
    total: INRAmount
    peak: INRAmount
    upfront: INRAmount
    quote_date: DateText = ""
    version: int | None = Field(default=None, ge=1, le=1_000_000)
    terms: ReportTerms | None = None


class ReportAssumptions(WorkspaceModel):
    delay_months: int | None = Field(default=None, ge=0, le=120)
    rate_increase_percent: float | None = Field(default=None, ge=0, le=60, allow_inf_nan=False)
    fx_increase_percent: float | None = Field(default=None, ge=0, le=60, allow_inf_nan=False)
    salary_lpa: float | None = Field(default=None, ge=0, le=10000, allow_inf_nan=False)
    budget_inr: INRAmount | None = None


class ReportSnapshot(WorkspaceModel):
    scenario: Scenario
    rows: list[ReportRow] = Field(min_length=1, max_length=13)
    assumptions: ReportAssumptions | None = None


class SavedComparison(WorkspaceModel):
    id: Identifier
    label: Label
    created_at: DateText
    snapshot: ReportSnapshot


class WorkspaceSnapshot(WorkspaceModel):
    offers: list[SavedOffer] = Field(max_length=12)
    payments: list[SavedPayment] = Field(max_length=6000)
    settings: WorkspaceSettings | None = None
    bundleIds: list[Identifier] = Field(default_factory=list, max_length=4)
    comparisons: list[SavedComparison] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def check_references(self):
        offer_ids = {offer.id for offer in self.offers}
        payment_ids = {payment.id for payment in self.payments}
        if len(offer_ids) != len(self.offers) or len(payment_ids) != len(self.payments):
            raise ValueError("Offer and payment identifiers must be distinct.")
        if len({entry.id for entry in self.comparisons}) != len(self.comparisons):
            raise ValueError("Saved comparison identifiers must be distinct.")
        if any(payment.offerId not in offer_ids for payment in self.payments):
            raise ValueError("A payment must belong to a saved offer.")
        if len(set(self.bundleIds)) != len(self.bundleIds) or not set(self.bundleIds) <= offer_ids:
            raise ValueError("Choose different saved offers to compare together.")
        return self


class WorkspaceUpdate(WorkspaceModel):
    revision: int = Field(strict=True, ge=0, lt=2_147_483_647)
    snapshot: WorkspaceSnapshot


class SendReport(WorkspaceModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_-]{24}$")]
    snapshot: ReportSnapshot


class InviteReviewer(WorkspaceModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
    snapshot: ReportSnapshot

    @model_validator(mode="after")
    def normalize(self):
        self.email = SignIn.normalize_email(self.email)
        return self


class AcceptInvite(WorkspaceModel):
    code: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{32}$")]


@contextmanager
def own_workspace(request):
    store = accounts_enabled(request)
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sign in to use an account workspace.")
    store.initialize()
    with store.connection() as connection:
        account_id = store.session_account(connection, token)
        if not account_id:
            raise HTTPException(401, "Sign in to use an account workspace.")
        yield store, connection, account_id


@router.get("")
def get_workspace(request: Request, response: Response):
    private_response(response)
    with own_workspace(request) as (store, connection, account_id):
        row = store.query(
            connection, "SELECT revision, updated_at, snapshot FROM account_workspaces WHERE account_id = ?",
            account_id,
        ).fetchone()
    if row is None:
        return {"revision": 0, "updated_at": None, "snapshot": None}
    return {
        "revision": row["revision"], "updated_at": row["updated_at"],
        "snapshot": WorkspaceSnapshot.model_validate_json(row["snapshot"]),
    }


@router.patch("", dependencies=[Depends(check_origin)])
@limiter.limit("35/minute")
def save_workspace(request: Request, response: Response, body: WorkspaceUpdate):
    private_response(response)
    snapshot = body.snapshot.model_dump_json()
    if len(snapshot.encode()) > 1_500_000:
        raise HTTPException(413, "This workspace is too large to sync.")
    updated_at = int(time.time())
    next_revision = body.revision + 1
    with own_workspace(request) as (store, connection, account_id):
        if body.revision == 0:
            result = store.query(
                connection, "INSERT INTO account_workspaces (account_id, revision, updated_at, snapshot) "
                "VALUES (?, ?, ?, ?) ON CONFLICT (account_id) DO NOTHING",
                account_id, next_revision, updated_at, snapshot,
            )
        else:
            result = store.query(
                connection, "UPDATE account_workspaces SET revision = ?, updated_at = ?, snapshot = ? "
                "WHERE account_id = ? AND revision = ?",
                next_revision, updated_at, snapshot, account_id, body.revision,
            )
        if result.rowcount != 1:
            raise HTTPException(409, "This workspace was updated elsewhere. Review the latest version before saving.")
    return {"revision": next_revision, "updated_at": updated_at}


@router.post("/reviewer-code", dependencies=[Depends(check_origin)])
@limiter.limit("10/minute")
def create_reviewer_code(request: Request, response: Response):
    private_response(response)
    code = secrets.token_urlsafe(18)
    expires_at = int(time.time()) + CODE_LIFETIME_SECONDS
    with own_workspace(request) as (store, connection, account_id):
        store.query(
            connection, "INSERT INTO workspace_reviewer_codes (account_id, code_hash, expires_at) VALUES (?, ?, ?) "
            "ON CONFLICT (account_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at",
            account_id, session_digest(code), expires_at,
        )
    return {"code": code, "expires_at": expires_at}


@router.post("/reports", status_code=201, dependencies=[Depends(check_origin)])
@limiter.limit("15/minute")
def share_report(request: Request, response: Response, body: SendReport):
    private_response(response)
    now = int(time.time())
    with own_workspace(request) as (store, connection, account_id):
        recipient = store.query(
            connection, "DELETE FROM workspace_reviewer_codes WHERE code_hash = ? AND expires_at > ? "
            "AND account_id <> ? RETURNING account_id",
            session_digest(body.code), now, account_id,
        ).fetchone()
        if recipient is None:
            raise HTTPException(422, "Use a valid, unused code from a different ISA Truth account.")
        report_id = store_report(store, connection, account_id, recipient["account_id"], now,
                                 body.snapshot.model_dump_json(exclude_defaults=True))
    return {"id": report_id}


def next_slot(rows):
    occupied = {row["slot"] for row in rows}
    return next((i for i in range(1, MAX_SENT_REPORTS + 1) if i not in occupied), None)


def store_report(store, connection, owner, recipient, now, snapshot):
    slot = next_slot(store.query(connection, "SELECT slot FROM workspace_reports WHERE owner_id = ?", owner).fetchall())
    if slot is None:
        raise HTTPException(409, "Remove a sent report before sharing another.")
    report_id = str(uuid4())
    result = store.query(connection, "INSERT INTO workspace_reports VALUES (?, ?, ?, ?, ?, ?) "
                         "ON CONFLICT (owner_id, slot) DO NOTHING", report_id, owner, recipient, slot, now, snapshot)
    if result.rowcount != 1:
        raise HTTPException(409, "Another report was just shared. Try again.")
    return report_id


@router.post("/report-invites", status_code=201, dependencies=[Depends(check_origin)])
@limiter.limit("10/minute")
def create_report_invite(request: Request, response: Response, body: InviteReviewer):
    private_response(response)
    now = int(time.time())
    code, invite_id = secrets.token_urlsafe(24), str(uuid4())
    with own_workspace(request) as (store, connection, owner):
        own_email = store.query(connection, "SELECT email FROM account_profiles WHERE id = ?", owner).fetchone()["email"]
        if own_email == body.email:
            raise HTTPException(422, "Enter an email address for a different account.")
        store.query(connection, "DELETE FROM workspace_report_invites WHERE owner_id = ? AND expires_at <= ?", owner, now)
        slot = next_slot(store.query(connection, "SELECT slot FROM workspace_report_invites WHERE owner_id = ?", owner).fetchall())
        if slot is None:
            raise HTTPException(409, "Revoke a pending invite before creating another.")
        result = store.query(connection, "INSERT INTO workspace_report_invites VALUES (?, ?, ?, ?, ?, ?, ?) "
                             "ON CONFLICT (owner_id, slot) DO NOTHING", invite_id, owner, body.email, session_digest(code),
                             now + INVITE_SECONDS, slot, body.snapshot.model_dump_json(exclude_defaults=True))
        if result.rowcount != 1:
            raise HTTPException(409, "Another invite was just created. Try again.")
    return {"id": invite_id, "code": code, "expires_at": now + INVITE_SECONDS}


@router.get("/report-invites")
def list_report_invites(request: Request, response: Response):
    private_response(response)
    with own_workspace(request) as (store, connection, owner):
        return [dict(row) for row in store.query(connection,
            "SELECT id, recipient_email, expires_at FROM workspace_report_invites WHERE owner_id = ? AND expires_at > ? ORDER BY expires_at DESC",
            owner, int(time.time())).fetchall()]


@router.delete("/report-invites/{invite_id}", status_code=204, dependencies=[Depends(check_origin)])
def revoke_report_invite(request: Request, invite_id: UUID):
    with own_workspace(request) as (store, connection, owner):
        result = store.query(connection, "DELETE FROM workspace_report_invites WHERE id = ? AND owner_id = ?", str(invite_id), owner)
        if result.rowcount != 1:
            raise HTTPException(404, "That pending invite is unavailable.")
    response = Response(status_code=204)
    private_response(response)
    return response


@router.post("/report-invites/accept", status_code=201, dependencies=[Depends(check_origin)])
@limiter.limit("15/minute")
def accept_report_invite(request: Request, response: Response, body: AcceptInvite):
    private_response(response)
    now = int(time.time())
    with own_workspace(request) as (store, connection, recipient):
        email = store.query(connection, "SELECT email FROM account_profiles WHERE id = ?", recipient).fetchone()["email"]
        invite = store.query(connection, "DELETE FROM workspace_report_invites WHERE code_hash = ? AND recipient_email = ? "
                             "AND expires_at > ? AND owner_id <> ? RETURNING owner_id, snapshot",
                             session_digest(body.code), email, now, recipient).fetchone()
        if invite is None:
            raise HTTPException(404, "This invite is unavailable for your account. Check the invited email address or ask for a new link.")
        report_id = store_report(store, connection, invite["owner_id"], recipient, now, invite["snapshot"])
    return {"id": report_id}


@router.get("/reports")
def list_reports(request: Request, response: Response):
    private_response(response)
    with own_workspace(request) as (store, connection, account_id):
        incoming = store.query(
            connection, "SELECT r.id, r.created_at, r.snapshot, a.display_name AS person FROM workspace_reports r "
            "JOIN account_profiles a ON a.id = r.owner_id WHERE r.reviewer_id = ? "
            "ORDER BY r.created_at DESC, r.id DESC LIMIT ?",
            account_id, REPORT_READ_LIMIT,
        ).fetchall()
        outgoing = store.query(
            connection, "SELECT r.id, r.created_at, r.snapshot, a.display_name AS person FROM workspace_reports r "
            "JOIN account_profiles a ON a.id = r.reviewer_id WHERE r.owner_id = ? "
            "ORDER BY r.created_at DESC, r.id DESC",
            account_id,
        ).fetchall()

    def summaries(rows):
        return [
            {"id": row["id"], "created_at": row["created_at"], "person": row["person"],
             "scenario": ReportSnapshot.model_validate_json(row["snapshot"]).scenario}
            for row in rows
        ]

    return {"received": summaries(incoming), "sent": summaries(outgoing)}


@router.get("/reports/{report_id}")
def get_report(request: Request, response: Response, report_id: UUID):
    private_response(response)
    with own_workspace(request) as (store, connection, account_id):
        row = store.query(
            connection, "SELECT r.created_at, r.snapshot, a.display_name AS shared_by FROM workspace_reports r "
            "JOIN account_profiles a ON a.id = r.owner_id WHERE r.id = ? AND (r.owner_id = ? OR r.reviewer_id = ?)",
            str(report_id), account_id, account_id,
        ).fetchone()
        if row is None:
            raise HTTPException(404, "This private report is unavailable for your account.")
    return {
        "created_at": row["created_at"], "shared_by": row["shared_by"],
        "snapshot": ReportSnapshot.model_validate_json(row["snapshot"]).model_dump(exclude_defaults=True),
    }


@router.delete("/reports/{report_id}", status_code=204, dependencies=[Depends(check_origin)])
def delete_report(request: Request, report_id: UUID):
    with own_workspace(request) as (store, connection, account_id):
        result = store.query(
            connection, "DELETE FROM workspace_reports WHERE id = ? AND (owner_id = ? OR reviewer_id = ?)",
            str(report_id), account_id, account_id,
        )
        if result.rowcount != 1:
            raise HTTPException(404, "This private report is unavailable for your account.")
    response = Response(status_code=204)
    private_response(response)
    return response
