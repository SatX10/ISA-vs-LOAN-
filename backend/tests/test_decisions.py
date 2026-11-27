import httpx
import pytest
from fastapi.testclient import TestClient

from app.engine.comparison import inr
from app.engine.loan import simulate_loan
from app.limiter import limiter
from app.main import create_app


ISA = {"principal": 3, "income_share_pct": 20, "starting_income_lpa": 9, "trigger_threshold_lpa": 3,
       "max_multiple": 2, "term_months": 36, "annual_income_growth_rate": .1}
LOAN = {"principal": 3, "annual_interest_rate": .12, "term_months": 36, "upfront_fee": .05}
COMPARE = {"isa": ISA, "loan": LOAN, "monthly_budget_inr": 8000}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("ACCOUNT_DB_PATH", str(tmp_path / "decisions.db"))
    for name in ("DATABASE_URL", "RENDER", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    limiter.reset()
    yield create_app(shared_contracts=False)
    limiter.reset()


def signup(client, name):
    response = client.post("/api/auth/sign-up", json={"email": f"{name}@example.test", "display_name": name,
                                                     "password": "decision-tool-passphrase"})
    assert response.status_code == 201


def test_negotiation_recalculates_discrete_rate_share_cap_and_fee_targets(app):
    with TestClient(app) as client:
        base = inr(simulate_loan(**LOAN, calculate_rate=False).total_paid)
        target = round(base - 2000, 2)
        result = client.post("/api/decisions/negotiate", json={
            "offer": {"kind": "loan", "id": "a", "label": "Loan", "terms": LOAN}, "salary_lpa": 9, "target_inr": target,
        }).json()
        choices = {row["term"]: row for row in result["options"]}
        rate = choices["rate"]["match"]["value"]
        assert choices["rate"]["match"]["total_inr"] <= target
        assert inr(simulate_loan(**(LOAN | {"annual_interest_rate": rate + .0001}), calculate_rate=False).total_paid) > target
        assert choices["upfront_fee"]["waiver_inr"] == 2000
        assert result["questions"]

        isa = client.post("/api/decisions/negotiate", json={"offer": {"kind": "isa", "id": "b", "label": "ISA", "terms": ISA},
                                                           "salary_lpa": 20, "target_inr": 450_000}).json()
        choices = {row["term"]: row["match"] for row in isa["options"]}
        assert choices["cap"] == {"value": 1.5, "total_inr": 450_000}
        assert choices["income_share"]["total_inr"] <= 450_000


def test_risk_returns_inspectable_grid_and_scales_only_foreign_installments(app):
    with TestClient(app) as client:
        assumptions = {**COMPARE, "salary_low_lpa": 5, "salary_high_lpa": 15, "points": 9,
                       "max_rate_increase": .04, "max_fx_increase": .2, "foreign_currency": True}
        risk = client.post("/api/decisions/risk", json=assumptions).json()
        assert len(risk["outcomes"]) == 729
        assert "probability" not in risk
        baseline = risk["outcomes"][0]
        fx = risk["outcomes"][8]
        assert fx["isa_total_inr"] == baseline["isa_total_inr"]
        assert fx["loan_total_inr"] == pytest.approx(5000 + (baseline["loan_total_inr"] - 5000) * 1.2, abs=.02)
        assert fx["loan_over_budget"] is True
        assert risk["assumptions"]["salaries_lpa"][-1] == 15
        assert client.post("/api/decisions/risk", json={**assumptions, "salary_low_lpa": 17}).status_code == 422


def test_payment_explanation_uses_rate_and_salary_changes_and_model_only_selects_facts(app, monkeypatch):
    body = {**COMPARE, "loan": {**LOAN, "rate_changes": {"13": .15}}, "question": "Why did the payment jump in month 13?", "month": 1}
    with TestClient(app) as client:
        answer = client.post("/api/decisions/explain", json=body).json()
        assert answer["month"] == 13
        assert any("12.00% to 15.00%" in fact for fact in answer["facts"])
        assert any("annual salary growth" in fact for fact in answer["facts"])
        assert client.post("/api/decisions/explain", json={**body, "question": "Check month 480"}).status_code == 422
        signup(client, "student")
        monkeypatch.setenv("OPENAI_API_KEY", "test-only")

        def model(url, **options):
            assert options["json"]["store"] is False
            assert "450000" not in options["json"]["input"]
            return httpx.Response(200, request=httpx.Request("POST", url), json={"output": [
                {"content": [{"type": "output_text", "text": '{"facts":["invented","loan"]}'}]},
            ]})

        monkeypatch.setattr("app.ai.httpx.post", model)
        fallback = client.post("/api/decisions/explain", json={**body, "use_ai": True}).json()
        assert fallback["mode"] == "fallback" and fallback["facts"] == answer["facts"]


def test_statement_repayment_models_include_fees_and_disclose_scheduled_dates(app):
    with TestClient(app) as client:
        result = client.post("/api/decisions/repayment", json={"balance_inr": 100_000, "rate": 0, "months": 10,
                                                              "prepayment_inr": 10_000, "prepayment_fee_inr": 500,
                                                              "refinance_rate": 0, "refinance_months": 20,
                                                              "refinance_fee_inr": 1000, "exit_fee_inr": 500}).json()
        assert result == {"keep": {"first_month_inr": 10_000, "total_inr": 100_000},
                          "prepay": {"first_month_inr": 9000, "total_inr": 100_500},
                          "refinance": {"first_month_inr": 5000, "total_inr": 101_500}}
        modeled = client.post("/api/portfolio", json={"funding_goal_inr": 300_000, "expected_salary_lpa": 9,
            "lower_salary_lpa": 6, "higher_salary_lpa": 12, "take_home_inr": 15_000, "essential_expenses_inr": 5000,
            "offers": [{"kind": "loan", "id": "lender", "label": "Loan", "terms": LOAN, "funding_date": "2026-01-31"}]}).json()
        assert modeled["budget_inr"] == 10_000
        assert modeled["offers"][0]["payment_dates"][:2] == ["2026-02-28", "2026-03-31"]
        assert modeled["offers"][0]["scheduled_balances_inr"][-1] == 0


def test_linked_payments_are_one_expense_and_account_scoped(app):
    with TestClient(app) as owner, TestClient(app) as other:
        signup(owner, "payer")
        signup(other, "other")
        path = "/api/auth/expenses/repayments/loan-1"
        expense = {"description": "Loan payment", "amount_paise": 845_520, "spent_on": "2026-11-02", "repayment_month": 1}
        saved = owner.post(path, json=expense)
        assert saved.status_code == 201
        expense_id = saved.json()["id"]
        assert owner.get(path).json() == [{"id": expense_id, "value": 8455.20, "date": "2026-11-02", "month": 1}]
        assert owner.get("/api/auth/expenses?month=2026-11").json()["total_paise"] == 845_520
        assert other.get(path).json() == []
        assert other.delete(f"/api/auth/expenses/{expense_id}").status_code == 404
        assert owner.delete(f"/api/auth/expenses/{expense_id}").status_code == 204
        assert owner.get(path).json() == []


def test_invite_is_recipient_bound_single_use_and_revocable(app):
    base = "/api/auth/workspace"
    snapshot = {"scenario": "expected", "rows": [{"kind": "loan", "label": "Loan v2", "funded_inr": 300_000,
        "remaining_gap_inr": 0, "extra_funding_inr": 0, "total": 350_000, "peak": 9722.22, "upfront": 0,
        "quote_date": "2026-11-14", "version": 2}], "assumptions": {"budget_inr": 10_000}}
    with TestClient(app) as owner, TestClient(app) as reviewer, TestClient(app) as other:
        for client, name in ((owner, "student"), (reviewer, "parent"), (other, "uninvited")):
            signup(client, name)
        invite = owner.post(f"{base}/report-invites", json={"email": "Parent@example.test", "snapshot": snapshot})
        assert invite.status_code == 201
        info = invite.json()
        accept = f"{base}/report-invites/accept"
        assert other.post(accept, json={"code": info["code"]}).status_code == 404
        assert other.delete(f"{base}/report-invites/{info['id']}").status_code == 404
        assert "code" not in owner.get(f"{base}/report-invites").json()[0]
        accepted = reviewer.post(accept, json={"code": info["code"]})
        assert accepted.status_code == 201
        assert reviewer.post(accept, json={"code": info["code"]}).status_code == 404
        path = f"{base}/reports/{accepted.json()['id']}"
        assert reviewer.get(path).json()["snapshot"] == snapshot
        assert other.get(path).status_code == 404
        assert owner.delete(path).status_code == 204
        assert reviewer.get(path).status_code == 404
