from fastapi.testclient import TestClient

from app.main import create_app


EXPENSE = {"description": "Calculus books", "category": "materials", "amount_paise": 54999, "spent_on": "2026-12-31"}
LEDGER = "/api/auth/expenses"
DECEMBER = f"{LEDGER}?month=2026-12"


def sign_up(client, email):
    assert client.post("/api/auth/sign-up", json={
        "email": email, "password": "expense-test-password", "display_name": "Learner",
    }).status_code == 201


def test_user_can_manage_private_expenses_with_exact_monthly_totals(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("ACCOUNT_DB_PATH", str(tmp_path / "accounts.db"))
    app = create_app(shared_contracts=False)
    with (
        TestClient(app, client=("198.51.100.10", 50000)) as owner,
        TestClient(app, client=("198.51.100.11", 50000)) as other,
    ):
        assert owner.get(DECEMBER).status_code == 401
        sign_up(owner, "owner@example.test")
        sign_up(other, "other@example.test")
        assert owner.post(LEDGER, json=EXPENSE, headers={"Origin": "https://untrusted.example"}).status_code == 403
        created = owner.post(LEDGER, json=EXPENSE)
        assert created.status_code == 201
        expense = f"{LEDGER}/{created.json()['id']}"
        assert owner.post(LEDGER, json={**EXPENSE, "amount_paise": 1, "category": "travel"}).status_code == 201
        ledger = owner.get(DECEMBER)
        assert ledger.headers["cache-control"] == "no-store"
        assert ledger.json()["total_paise"] == 55000
        assert ledger.json()["entry_count"] == 2
        assert ledger.json()["categories"][0] == {"category": "materials", "total_paise": 54999, "entries": 1}
        assert other.get(DECEMBER).json()["expenses"] == []
        assert other.patch(expense, json=EXPENSE).status_code == 404
        assert other.delete(expense).status_code == 404
        assert owner.patch(expense, json={**EXPENSE, "spent_on": "2027-01-01"}).status_code == 200
        assert owner.get(DECEMBER).json()["total_paise"] == 1
        assert owner.get(f"{LEDGER}?month=2027-01").json()["total_paise"] == 54999
        assert owner.delete(expense).status_code == 204
        assert owner.get(f"{LEDGER}?month=2027-01").json()["entry_count"] == 0
        assert owner.post(LEDGER, json={**EXPENSE, "amount_paise": 12.5}).status_code == 422
        assert owner.get(f"{LEDGER}?month=2026-02-15").status_code == 422
