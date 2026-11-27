from hashlib import sha256
import json
import sqlite3

import httpx
import pytest
from fastapi.testclient import TestClient

from app.limiter import limiter
from app.main import create_app


CREDENTIALS = {"email": "Student@example.com", "password": "planning-test-passphrase"}
PREFERENCES = {"display_name": "Student", "monthly_budget_inr": 8_000, "priority": "income_flexibility"}
PLAN = {
    "isa": {
        "principal": 5, "income_share_pct": 10, "starting_income_lpa": 6,
        "trigger_threshold_lpa": 3, "max_multiple": 1.5, "term_months": 60,
        "annual_income_growth_rate": 0.08,
    },
    "loan": {"principal": 5, "annual_interest_rate": 0.12, "term_months": 60},
    "monthly_budget_inr": 8_000,
    "lower_salary_lpa": 2,
    "priority": "total_cost",
}


@pytest.fixture
def browser(monkeypatch, tmp_path):
    monkeypatch.setenv("ACCOUNT_DB_PATH", str(tmp_path / "accounts.db"))
    for name in ("DATABASE_URL", "RENDER", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    limiter.reset()
    with TestClient(create_app(shared_contracts=False)) as browser:
        yield browser
    limiter.reset()


def test_profiles_persist_and_logout_revokes_token(browser, tmp_path):
    assert browser.get("/api/auth/session").json() == {"profile": None, "available": True}
    assert browser.patch("/api/auth/profile", json=PREFERENCES).status_code == 401
    signup = browser.post("/api/auth/sign-up", json={**CREDENTIALS, "display_name": "Test student"})
    assert signup.status_code == 201
    assert "HttpOnly" in signup.headers["set-cookie"] and "SameSite=lax" in signup.headers["set-cookie"]
    token = browser.cookies.get("isa_session")
    email = CREDENTIALS["email"].lower()
    assert signup.json()["profile"]["email"] == email
    assert browser.patch("/api/auth/profile", json=PREFERENCES).json()["profile"] == {**PREFERENCES, "email": email}
    assert browser.post("/api/auth/sign-up", json={**CREDENTIALS, "display_name": "Duplicate"}).status_code == 409

    with sqlite3.connect(tmp_path / "accounts.db") as db:
        assert db.execute("SELECT token_hash FROM account_sessions").fetchone()[0] == sha256(token.encode()).hexdigest()
        assert CREDENTIALS["password"] not in db.execute("SELECT password_hash FROM account_profiles").fetchone()[0]

    assert browser.post("/api/auth/sign-out").status_code == 204
    assert browser.get("/api/auth/session", headers={"Cookie": f"isa_session={token}"}).json()["profile"] is None
    assert browser.post("/api/auth/sign-in", json={**CREDENTIALS, "password": "an incorrect password"}).status_code == 401

    with TestClient(create_app(shared_contracts=False)) as fresh_browser:
        renewed = fresh_browser.post("/api/auth/sign-in", json=CREDENTIALS)
        assert renewed.status_code == 200
        assert fresh_browser.cookies.get("isa_session") != token
        assert fresh_browser.get("/api/auth/session").json()["profile"] == {**PREFERENCES, "email": email}


def test_account_mutations_reject_cross_origin_and_redact_password(browser):
    blocked = browser.post("/api/auth/sign-up", headers={"Origin": "https://unrelated.example"}, json={
        **CREDENTIALS, "display_name": "Student",
    })
    assert blocked.status_code == 403
    invalid = browser.post("/api/v1/auth/sign-up", json={
        **CREDENTIALS, "password": "invalidsecret",
    })
    assert invalid.status_code == 422
    assert "invalidsecret" not in invalid.text and '"input"' not in invalid.text


def test_planner_enforces_budget_and_uses_stress_scenario(browser):
    result = browser.post("/api/planner", json=PLAN)
    assert result.status_code == 200
    plan = result.json()
    assert plan["suggestion"] == "isa"
    assert plan["analysis_mode"] == "calculator"
    assert plan["plans"]["isa"]["lower_total_inr"] == 0
    assert plan["plans"]["loan"]["lower_peak_inr"] == plan["plans"]["loan"]["expected_peak_inr"]
    assert plan["plans"]["isa"]["fits_budget"] and not plan["plans"]["loan"]["fits_budget"]
    assert browser.post("/api/planner", json={**PLAN, "monthly_budget_inr": 100}).json()["suggestion"] == "neither"
    assert browser.post("/api/planner", json={**PLAN, "lower_salary_lpa": 7}).status_code == 422
    assert browser.post("/api/planner", json={**PLAN, "use_ai": True}).status_code == 401


def test_planner_accounts_for_upfront_financed_and_monthly_costs(browser):
    zero_interest_plan = {
        **PLAN, "loan": {**PLAN["loan"], "annual_interest_rate": 0, "term_months": 50}, "monthly_budget_inr": 10_100,
    }
    upfront = browser.post("/api/planner", json={**zero_interest_plan, "loan_upfront_fee_inr": 20_000})
    financed = browser.post("/api/planner", json={
        **zero_interest_plan, "loan_upfront_fee_inr": 20_000, "loan_financed_cost_inr": 60_000,
    })
    monthly = browser.post("/api/planner", json={**zero_interest_plan, "loan_monthly_fee_inr": 200})
    assert upfront.status_code == financed.status_code == monthly.status_code == 200
    assert upfront.json()["plans"]["loan"] == {
        "expected_total_inr": 520_000, "expected_peak_inr": 10_000,
        "lower_total_inr": 520_000, "lower_peak_inr": 10_000, "fits_budget": True,
    }
    assert financed.json()["plans"]["loan"] == {
        "expected_total_inr": 580_000, "expected_peak_inr": 11_200,
        "lower_total_inr": 580_000, "lower_peak_inr": 11_200, "fits_budget": False,
    }
    assert monthly.json()["plans"]["loan"] == {
        "expected_total_inr": 510_000, "expected_peak_inr": 10_200,
        "lower_total_inr": 510_000, "lower_peak_inr": 10_200, "fits_budget": False,
    }
    assert financed.json()["plans"]["isa"] == upfront.json()["plans"]["isa"]
    for field in ("loan_upfront_fee_inr", "loan_financed_cost_inr", "loan_monthly_fee_inr"):
        assert browser.post("/api/planner", json={**PLAN, field: -1}).status_code == 422


def test_ai_only_receives_planning_estimates_and_preserves_calculation(browser, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    assert browser.get("/api/planner/capabilities").json() == {"ai_available": True}
    browser.post("/api/auth/sign-up", json={**CREDENTIALS, "display_name": "Private name"})

    def model(url, **options):
        assert url == "https://api.openai.com/v1/responses"
        assert options["json"]["store"] is False
        sent = options["json"]["input"]
        assert "Private name" not in sent and CREDENTIALS["email"].lower() not in sent
        return httpx.Response(200, request=httpx.Request("POST", url), json={"output": [
            {"content": [{"type": "output_text", "text": '{"steps":["terms","stress","trigger"]}'}]},
        ]})

    monkeypatch.setattr("app.ai.httpx.post", model)
    baseline = browser.post("/api/planner", json=PLAN).json()
    assisted = browser.post("/api/planner", json={**PLAN, "use_ai": True}).json()
    assert assisted["analysis_mode"] == "ai"
    assert assisted["plans"] == baseline["plans"]
    assert assisted["suggestion"] == baseline["suggestion"]
    assert assisted["next_steps"] != baseline["next_steps"]

    def unavailable(*args, **kwargs):
        raise httpx.ReadTimeout("Provider unavailable")

    monkeypatch.setattr("app.ai.httpx.post", unavailable)
    fallback = browser.post("/api/planner", json={**PLAN, "use_ai": True}).json()
    assert fallback["analysis_mode"] == "fallback"
    assert fallback["next_steps"] == baseline["next_steps"]


@pytest.mark.parametrize("focus", ["income_flexibility", "unclear"])
def test_planner_focuses_guidance_on_the_optional_concern(browser, monkeypatch, focus):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    assert browser.post("/api/auth/sign-up", json={**CREDENTIALS, "display_name": "Student"}).status_code == 201
    concern = "I might be without income for several months."
    plan = {**PLAN, "loan": {**PLAN["loan"], "grace_months": 2, "grace_mode": "no_interest"}}

    def model(url, **options):
        payload = options["json"]
        assert json.loads(payload["input"])["concern"] == concern
        assert "focus" in payload["text"]["format"]["schema"]["required"]
        return httpx.Response(200, request=httpx.Request("POST", url), json={"output": [
            {"content": [{"type": "output_text", "text": json.dumps({
                "steps": ["stress", "terms", "trigger"], "focus": focus,
            })}]},
        ]})

    monkeypatch.setattr("app.ai.httpx.post", model)
    baseline_response = browser.post("/api/planner", json={**plan, "concern": concern})
    assisted_response = browser.post("/api/planner", json={**plan, "use_ai": True, "concern": f" {concern} "})
    assert baseline_response.status_code == assisted_response.status_code == 200
    baseline, assisted = baseline_response.json(), assisted_response.json()
    assert assisted["analysis_mode"] == "ai"
    assert assisted["plans"] == baseline["plans"]
    assert assisted["suggestion"] == baseline["suggestion"]
    assert baseline["perspective"] == {"focus": "total_cost", "from_concern": False}
    if focus == "unclear":
        assert assisted["perspective"] == baseline["perspective"]
    else:
        assert assisted["perspective"] == {"focus": focus, "from_concern": True, "no_income": {
            "months": 3,
            "isa_payments_inr": 0,
            "loan_payments_inr": assisted["plans"]["loan"]["expected_peak_inr"],
            "isa_threshold_lpa": PLAN["isa"]["trigger_threshold_lpa"],
            "loan_grace_months": 2,
            "loan_grace_mode": "no_interest",
        }}


def test_hosted_accounts_require_persistent_storage(browser, monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    with TestClient(create_app(shared_contracts=False)) as hosted:
        assert hosted.get("/api/auth/session").json() == {"profile": None, "available": False}
        signup = hosted.post("/api/auth/sign-up", json={**CREDENTIALS, "display_name": "Student"})
        assert signup.status_code == 503
        assert hosted.post("/api/planner", json=PLAN).status_code == 200
