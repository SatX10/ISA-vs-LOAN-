import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.accounts import SESSION_SECONDS
from app.limiter import limiter

router = APIRouter(prefix="/auth", tags=["accounts"])
COOKIE = "isa_session"
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Budget = Annotated[int, Field(ge=0, le=10_000_000)]
Priority = Literal["total_cost", "monthly_cost", "income_flexibility"]


class SignIn(BaseModel):
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)]
    password: Annotated[str, Field(min_length=12, max_length=128)]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value.lower()


class SignUp(SignIn):
    display_name: Name


class Preferences(BaseModel):
    display_name: Name
    monthly_budget_inr: Budget | None
    priority: Priority


def check_origin(request: Request):
    origin = request.headers.get("origin")
    allowed = {str(request.base_url).rstrip("/"), *request.app.state.trusted_origins}
    if (origin and origin not in allowed) or request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "This request must come from ISA Truth.")


def accounts_enabled(request):
    store = request.app.state.accounts
    if not store.available:
        raise HTTPException(503, "Accounts are unavailable until persistent storage is configured.")
    return store


def set_session(request, response, token, secure=False):
    response.set_cookie(
        COOKIE, token, max_age=SESSION_SECONDS, path="/api", httponly=True,
        samesite="lax", secure=secure or request.url.scheme == "https" or request.app.state.accounts.hosted,
    )


def private_response(response):
    response.headers["Cache-Control"] = "no-store"


@router.get("/session")
def session(request: Request, response: Response):
    private_response(response)
    store = request.app.state.accounts
    return {"profile": store.profile(request.cookies.get(COOKIE)), "available": store.available}


@router.post("/sign-up", status_code=201, dependencies=[Depends(check_origin)])
@limiter.limit("5/minute")
def sign_up(request: Request, response: Response, body: SignUp):
    store = accounts_enabled(request)
    token = store.register(body.email, body.display_name, body.password, request.cookies.get(COOKIE))
    if token is None:
        raise HTTPException(409, "An account with this email already exists.")
    set_session(request, response, token)
    private_response(response)
    return {"profile": store.profile(token)}


@router.post("/sign-in", dependencies=[Depends(check_origin)])
@limiter.limit("10/minute")
def sign_in(request: Request, response: Response, body: SignIn):
    store = accounts_enabled(request)
    token = store.authenticate(body.email, body.password, request.cookies.get(COOKIE))
    if token is None:
        raise HTTPException(401, "The email or password is incorrect.")
    set_session(request, response, token)
    private_response(response)
    return {"profile": store.profile(token)}


@router.post("/sign-out", status_code=204, dependencies=[Depends(check_origin)])
def sign_out(request: Request):
    request.app.state.accounts.revoke(request.cookies.get(COOKIE))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, path="/api", httponly=True, samesite="lax")
    private_response(response)
    return response


@router.patch("/profile", dependencies=[Depends(check_origin)])
@limiter.limit("25/minute")
def update_profile(request: Request, response: Response, body: Preferences):
    store = accounts_enabled(request)
    profile = store.profile(request.cookies.get(COOKIE), changes=body)
    if profile is None:
        raise HTTPException(401, "Sign in to save your preferences.")
    private_response(response)
    return {"profile": profile}
