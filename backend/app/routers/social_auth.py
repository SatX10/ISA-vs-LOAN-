"""Google and Microsoft OpenID Connect sign-in."""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode, urlsplit
from uuid import UUID

import httpx
import jwt
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.limiter import limiter
from app.routers.accounts import COOKIE, private_response, set_session

router = APIRouter(prefix="/auth/oauth", tags=["accounts"])
MS = "https://login.microsoftonline.com"
GOOGLE = "https://accounts.google.com"
FLOW_SECONDS = 600


@dataclass(frozen=True)
class Provider:
    authorization_url: str
    token_url: str


PROVIDERS = {
    "google": Provider(f"{GOOGLE}/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token"),
    "microsoft": Provider(f"{MS}/common/oauth2/v2.0/authorize", f"{MS}/common/oauth2/v2.0/token"),
}


def provider_config(provider):
    origin = (os.getenv("OAUTH_PUBLIC_ORIGIN") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")
    client_id = os.getenv(f"{provider.upper()}_CLIENT_ID", "").strip()
    secret = os.getenv(f"{provider.upper()}_CLIENT_SECRET", "").strip()
    url = urlsplit(origin)
    valid_scheme = url.scheme == "https" or (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1"))
    if valid_scheme and url.hostname and not (url.path or url.query or url.fragment or url.username) and client_id and secret:
        return origin, client_id, secret
    return None


def callback_path(provider):
    return f"/api/auth/oauth/{provider}/callback"


def encode_bytes(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def sign_cookie(flow, secret):
    payload = encode_bytes(json.dumps(flow, separators=(",", ":")).encode())
    signature = hmac.digest(secret.encode(), payload.encode(), "sha256")
    return f"{payload}.{encode_bytes(signature)}"


def read_cookie(value, state, secret):
    payload, signature = value.split(".", 1)
    expected = encode_bytes(hmac.digest(secret.encode(), payload.encode(), "sha256"))
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid flow cookie")
    flow = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if not hmac.compare_digest(flow["state"], state) or flow["expires"] < time.time():
        raise ValueError("Expired or mismatched authorization flow")
    return flow


def redirect(target):
    response = RedirectResponse(target, status_code=303)
    private_response(response)
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def error_redirect(page, reason, destination):
    query = urlencode({"oauth_error": reason, "oauth_return": destination})
    return redirect(f"{page}?{query}")


def identity_claims(provider, token, audience, nonce, client):
    header = jwt.get_unverified_header(token)
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise ValueError("Unexpected signing algorithm or missing key ID")
    if provider == "google":
        issuer = [GOOGLE, "accounts.google.com"]
        jwks = "https://www.googleapis.com/oauth2/v3/certs"
    else:
        unverified = jwt.decode(token, options={"verify_signature": False})
        tenant = str(UUID(unverified["tid"]))
        issuer = f"{MS}/{tenant}/v2.0"
        jwks = f"{MS}/common/discovery/v2.0/keys"
    response = client.get(jwks)
    response.raise_for_status()
    for key in response.json()["keys"]:
        if key.get("kid") != header.get("kid") or key.get("kty") != "RSA":
            continue
        if provider == "microsoft" and key.get("issuer", "").replace("{tenantid}", tenant) != issuer:
            continue
        claims = jwt.decode(
            token, jwt.PyJWK.from_dict(key).key, algorithms=["RS256"], audience=audience, issuer=issuer,
            options={"require": ["iss", "aud", "sub", "exp", "iat", "nonce"], "strict_aud": True},
            leeway=30,
        )
        if not hmac.compare_digest(claims["nonce"], nonce) or claims.get("azp", audience) != audience:
            raise ValueError("Invalid authorization claims")
        if provider == "google":
            claims["iss"] = GOOGLE
        return claims
    raise ValueError("Provider signing key not found")


def exchange_identity(provider, config, code, flow):
    origin, client_id, secret = config
    with httpx.Client(timeout=8) as client:
        response = client.post(PROVIDERS[provider].token_url, data={
            "grant_type": "authorization_code", "code": code, "client_id": client_id,
            "client_secret": secret, "redirect_uri": origin + callback_path(provider),
            "code_verifier": flow["verifier"],
        })
        response.raise_for_status()
        claims = identity_claims(provider, response.json()["id_token"], client_id, flow["nonce"], client)
    email = claims.get("email") or (claims.get("preferred_username") if provider == "microsoft" else None)
    if provider == "google" and claims.get("email_verified") is not True:
        email = None
    if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        email = None
    name = claims.get("name")
    name = (name.strip()[:80] if isinstance(name, str) else "") or "ISA Truth user"
    return claims["iss"], claims["sub"], email.lower() if email else None, name


@router.get("/{provider}/start")
@limiter.limit("15/minute")
def start(request: Request, provider: str, page: str = "sign-in", target: str = "profile"):
    page = "/sign-up" if page == "sign-up" else "/sign-in"
    destination = f"/{target}" if target in {"planner", "workspace"} else "/profile"
    config = provider_config(provider) if provider in PROVIDERS else None
    if not config or not request.app.state.accounts.available:
        return error_redirect(page, "unavailable", destination)
    origin, client_id, secret = config
    flow = {
        "provider": provider, "state": secrets.token_urlsafe(32), "nonce": secrets.token_urlsafe(32),
        "verifier": secrets.token_urlsafe(48), "expires": int(time.time()) + FLOW_SECONDS,
        "page": page, "destination": destination,
    }
    challenge = encode_bytes(hashlib.sha256(flow["verifier"].encode()).digest())
    query = urlencode({
        "client_id": client_id, "redirect_uri": origin + callback_path(provider), "response_type": "code",
        "scope": "openid email profile", "state": flow["state"], "nonce": flow["nonce"], "prompt": "select_account",
        "code_challenge": challenge, "code_challenge_method": "S256",
    })
    response = redirect(f"{PROVIDERS[provider].authorization_url}?{query}")
    response.set_cookie(
        f"isa_oauth_{provider}", sign_cookie(flow, secret), max_age=FLOW_SECONDS,
        path=callback_path(provider), httponly=True, samesite="lax", secure=origin.startswith("https://"),
    )
    return response


@router.get("/{provider}/callback")
@limiter.limit("15/minute")
def callback(request: Request, provider: str, state: str = "", code: str = "", error: str = ""):
    config = provider_config(provider) if provider in PROVIDERS else None
    if not config or not request.app.state.accounts.available:
        return error_redirect("/sign-in", "unavailable", "/profile")
    cookie = f"isa_oauth_{provider}"
    try:
        flow = read_cookie(request.cookies.get(cookie, ""), state, config[2])
        if flow["provider"] != provider:
            raise ValueError("Mismatched provider")
    except (ValueError, TypeError, KeyError):
        return error_redirect("/sign-in", "expired", "/profile")
    token = None
    reason = "cancelled" if error == "access_denied" else "failed"
    if code and not error:
        try:
            issuer, subject, email, name = exchange_identity(provider, config, code, flow)
            token = request.app.state.accounts.authenticate_identity(
                provider, issuer, subject, email, name, request.cookies.get(COOKIE),
            )
            reason = "existing_account" if email else "missing_email"
        except (httpx.HTTPError, jwt.PyJWTError, ValueError, TypeError, KeyError):
            pass
    response = redirect(flow["destination"]) if token else error_redirect(flow["page"], reason, flow["destination"])
    response.delete_cookie(cookie, path=callback_path(provider), secure=config[0].startswith("https://"), httponly=True)
    if token:
        set_session(request, response, token, secure=config[0].startswith("https://"))
    return response
