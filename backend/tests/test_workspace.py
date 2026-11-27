from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.accounts import session_digest
from app.main import create_app

WORKSPACE = "/api/auth/workspace"
PASSWORD = "test-account-passphrase"
SNAPSHOT = {
    "offers": [{
        "id": "offer-a", "kind": "loan", "label": "Student loan", "date": "2026-11-21",
        "note": "Private quote note", "version": 1, "inputs": {
            "loan_amount": 500_000, "loan_rate_changes": "13: 12.5", "budget_inr": None,
        },
    }],
    "payments": [{"id": "payment-a", "offerId": "offer-a", "month": 1, "value": 7240.56}],
    "settings": {
        "goal": 500_000, "grants": "20000", "savings": 1000, "family": 0, "budget": "",
        "expected": "8.5", "lower": 6, "higher": 10, "delay": 6, "rateShock": 2, "fxShock": 10,
    },
    "bundleIds": [],
}
REPORT = {
    "scenario": "expected",
    "rows": [{
        "kind": "loan", "label": "Student loan", "funded_inr": 500_000, "remaining_gap_inr": 0,
        "extra_funding_inr": 0, "total": 665_000, "peak": 12_000, "upfront": 2000,
    }],
}


@pytest.fixture
def app(monkeypatch, tmp_path):
    monkeypatch.setenv("ACCOUNT_DB_PATH", str(tmp_path / "accounts.db"))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    return create_app(shared_contracts=False)


def browser(app, label):
    return TestClient(app, client=(f"workspace-{label}", 50000))


def sign_up(client, label):
    response = client.post("/api/auth/sign-up", json={
        "email": f"{label}@example.com", "display_name": label, "password": PASSWORD,
    })
    assert response.status_code == 201, response.text


def test_sync_is_private_and_uses_compare_and_swap(app):
    with browser(app, "owner") as owner, browser(app, "another-device") as device, browser(app, "different") as other:
        assert other.get(WORKSPACE).status_code == 401
        sign_up(owner, "owner")
        sign_up(other, "other")
        assert owner.get(WORKSPACE).json() == {"revision": 0, "updated_at": None, "snapshot": None}
        assert owner.patch(WORKSPACE, headers={"Origin": "https://other.example"}, json={
            "revision": 0, "snapshot": SNAPSHOT,
        }).status_code == 403
        assert device.post("/api/auth/sign-in", json={
            "email": "owner@example.com", "password": PASSWORD,
        }).status_code == 200
        assert device.get(WORKSPACE).json()["revision"] == 0
        created = owner.patch(WORKSPACE, json={"revision": 0, "snapshot": SNAPSHOT})
        assert created.status_code == 200, created.text
        assert created.json()["revision"] == 1

        current = device.get(WORKSPACE)
        assert current.headers["cache-control"] == "no-store"
        assert current.json()["snapshot"]["payments"][0]["value"] == 7240.56
        assert current.json()["snapshot"]["offers"][0]["inputs"]["loan_rate_changes"] == "13: 12.5"
        assert current.json()["snapshot"]["settings"]["budget"] == ""
        assert other.get(WORKSPACE).json()["snapshot"] is None
        assert device.patch(WORKSPACE, json={
            "revision": 0, "snapshot": {"offers": [], "payments": []},
        }).status_code == 409

        labels = ["Device A", "Device B"]
        def update(client, label):
            edited = deepcopy(SNAPSHOT)
            edited["offers"][0]["label"] = label
            return client.patch(WORKSPACE, json={"revision": 1, "snapshot": edited}).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(update, [owner, device], labels))
        assert sorted(results) == [200, 409]
        latest = device.get(WORKSPACE).json()
        assert latest["revision"] == 2
        assert latest["snapshot"]["offers"][0]["label"] == labels[results.index(200)]
        assert device.post("/api/auth/sign-out").status_code == 204
        assert device.get(WORKSPACE).status_code == 401


def test_report_is_read_only_recipient_bound_and_revocable(app):
    with browser(app, "sender") as sender, browser(app, "reviewer") as reviewer, browser(app, "guest") as guest:
        sign_up(sender, "sender")
        sign_up(reviewer, "reviewer")
        first_code = reviewer.post(f"{WORKSPACE}/reviewer-code").json()["code"]
        code = reviewer.post(f"{WORKSPACE}/reviewer-code").json()["code"]
        assert first_code != code
        assert sender.post(f"{WORKSPACE}/reports", json={"code": first_code, "snapshot": REPORT}).status_code == 422
        assert reviewer.post(f"{WORKSPACE}/reports", json={"code": code, "snapshot": REPORT}).status_code == 422
        invalid = deepcopy(REPORT)
        invalid["rows"][0]["salary"] = "private-salary"
        rejected = sender.post(f"{WORKSPACE}/reports", json={"code": code, "snapshot": invalid})
        assert rejected.status_code == 422 and "private-salary" not in rejected.text

        sent = sender.post(f"{WORKSPACE}/reports", json={"code": code, "snapshot": REPORT})
        assert sent.status_code == 201, sent.text
        report_id = sent.json()["id"]
        path = f"{WORKSPACE}/reports/{report_id}"
        assert sender.post(f"{WORKSPACE}/reports", json={"code": code, "snapshot": REPORT}).status_code == 422
        assert guest.get(path).status_code == 401
        sign_up(guest, "stranger")
        assert guest.get(path).status_code == guest.delete(path).status_code == 404
        assert guest.get(f"{WORKSPACE}/reports").json() == {"received": [], "sent": []}
        assert reviewer.get(WORKSPACE).json()["snapshot"] is None

        received = reviewer.get(f"{WORKSPACE}/reports").json()
        assert received["received"][0]["person"] == "sender"
        assert received["received"][0]["id"] == report_id and not received["sent"]
        assert sender.get(f"{WORKSPACE}/reports").json()["sent"][0]["person"] == "reviewer"
        view = reviewer.get(path)
        assert view.headers["cache-control"] == "no-store"
        assert view.json()["snapshot"] == REPORT
        assert reviewer.patch(path, json=REPORT).status_code == 405
        assert sender.delete(path).status_code == 204
        assert reviewer.get(path).status_code == 404
        assert reviewer.get(f"{WORKSPACE}/reports").json()["received"] == []


def test_expired_code_and_orphan_payment_are_rejected(app):
    with browser(app, "saver") as saver, browser(app, "expired") as reviewer:
        sign_up(saver, "saver")
        sign_up(reviewer, "expired")
        orphaned = deepcopy(SNAPSHOT)
        orphaned["payments"][0]["offerId"] = "missing"
        assert saver.patch(WORKSPACE, json={"revision": 0, "snapshot": orphaned}).status_code == 422
        assert saver.get(WORKSPACE).json()["revision"] == 0
        code = reviewer.post(f"{WORKSPACE}/reviewer-code").json()["code"]
        store = app.state.accounts
        with store.connection() as connection:
            store.query(connection, "UPDATE workspace_reviewer_codes SET expires_at = 1 WHERE code_hash = ?", session_digest(code))
        assert saver.post(f"{WORKSPACE}/reports", json={"code": code, "snapshot": REPORT}).status_code == 422
