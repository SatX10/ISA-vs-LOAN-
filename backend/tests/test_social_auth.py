from hashlib import sha256
import json
import time
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.main import create_app
from app.routers import social_auth


@pytest.fixture
def browser(monkeypatch, tmp_path):
    for var in ("DATABASE_URL", "RENDER", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
                "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"):
        monkeypatch.delenv(var, raising=False)
    for provider in ("GOOGLE", "MICROSOFT"):
        monkeypatch.setenv(f"{provider}_CLIENT_ID", f"{provider.lower()}-test")
        monkeypatch.setenv(f"{provider}_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("OAUTH_PUBLIC_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("ACCOUNT_DB_PATH", str(tmp_path / "accounts.db"))
    with TestClient(create_app(shared_contracts=False), base_url="http://localhost:5173") as browser:
        yield browser


@pytest.mark.parametrize("provider", ["google", "microsoft"])
def test_provider_signup_and_repeat_login(browser, monkeypatch, provider):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public_key["kid"] = "test-key"
    client_class = httpx.Client
    tenant = "9188040d-6c67-4c5b-b112-36a304b66dad"
    issuer = social_auth.GOOGLE if provider == "google" else f"{social_auth.MS}/{tenant}/v2.0"
    if provider == "microsoft":
        public_key["issuer"] = issuer
    original_email = f"{provider}@example.test"

    def login(email):
        response = browser.get(f"/api/auth/oauth/{provider}/start?page=sign-up&target=planner", follow_redirects=False)
        assert response.status_code == 303
        auth_url = urlsplit(response.headers["location"])
        query = {key: item[0] for key, item in parse_qs(auth_url.query).items()}
        assert response.headers["location"].startswith(social_auth.PROVIDERS[provider].authorization_url + "?")
        assert query["prompt"] == "select_account" and query["code_challenge_method"] == "S256"
        now = int(time.time())
        token = jwt.encode({
            "iss": issuer, "tid": tenant, "sub": "stable-subject", "aud": f"{provider}-test",
            "iat": now, "exp": now + 300, "nonce": query["nonce"],
            "email": email, "email_verified": True, "name": "Test Learner",
        }, private_key, algorithm="RS256", headers={"kid": "test-key"})

        def remote(request):
            if request.method == "POST":
                assert str(request.url) == social_auth.PROVIDERS[provider].token_url
                form = parse_qs(request.content.decode())
                assert form["code"] == ["one-time-code"]
                assert form["redirect_uri"] == [query["redirect_uri"]]
                assert social_auth.encode_bytes(sha256(form["code_verifier"][0].encode()).digest()) == query["code_challenge"]
                return httpx.Response(200, json={"id_token": token})
            assert request.url.host in ("www.googleapis.com", "login.microsoftonline.com")
            return httpx.Response(200, json={"keys": [public_key]})

        monkeypatch.setattr(social_auth.httpx, "Client", lambda **kwargs: client_class(
            transport=httpx.MockTransport(remote), **kwargs,
        ))
        callback = social_auth.callback_path(provider)
        result = browser.get(f"{callback}?{urlencode({'state': query['state'], 'code': 'one-time-code'})}", follow_redirects=False)
        assert result.headers["location"] == "/planner"
        assert browser.cookies.get("isa_session")
        assert browser.get("/api/auth/session").json()["profile"]["email"] == original_email
        assert browser.get(f"{callback}?state={query['state']}&code=one-time-code", follow_redirects=False).headers[
            "location"
        ].startswith("/sign-in?oauth_error=expired")
        assert browser.post("/api/auth/sign-out").status_code == 204

    login(original_email)
    login("updated-alias@example.test")


def test_provider_collision_and_cancel_keep_existing_account_safe(browser, monkeypatch):
    credentials = {"email": "existing@example.test", "password": "a-sample-password", "display_name": "Original"}
    assert browser.post("/api/auth/sign-up", json=credentials).status_code == 201
    browser.post("/api/auth/sign-out")
    monkeypatch.setattr(social_auth, "exchange_identity", lambda *_: (
        social_auth.GOOGLE, "unrelated-subject", credentials["email"], "Different user",
    ))
    start = "/api/auth/oauth/google/start?page=sign-up"
    callback = social_auth.callback_path("google")
    response = browser.get(start, follow_redirects=False)
    state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
    denied = browser.get(f"{callback}?state=incorrect&code=sample", follow_redirects=False)
    assert denied.headers["location"].startswith("/sign-in?oauth_error=expired")
    collision = browser.get(f"{callback}?state={state}&code=sample", follow_redirects=False)
    assert collision.headers["location"].startswith("/sign-up?oauth_error=existing_account")
    assert browser.get("/api/auth/session").json()["profile"] is None
    response = browser.get(start, follow_redirects=False)
    state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
    cancelled = browser.get(f"{callback}?state={state}&error=access_denied", follow_redirects=False)
    assert cancelled.headers["location"].startswith("/sign-up?oauth_error=cancelled")
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET")
    assert browser.get(start, follow_redirects=False).headers["location"].startswith("/sign-up?oauth_error=unavailable")
