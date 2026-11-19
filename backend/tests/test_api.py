"""
Integration tests for FastAPI main app and API routes.
"""

from __future__ import annotations
import csv
from io import StringIO
import pytest
from starlette.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(db, "DB_PATH", tmp_path_factory.mktemp("contracts") / "test.db")
        with TestClient(app) as test_client:
            yield test_client


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.fixture
def comparison_payload():
    return {
        "isa": {
            "principal": 5.0,
            "income_share_pct": 15.0,
            "starting_income_lpa": 9.0,
            "trigger_threshold_lpa": 4.0,
            "max_multiple": 1.5,
            "term_months": 60,
            "annual_income_growth_rate": 0.08,
        },
        "loan": {
            "principal": 5.0,
            "annual_interest_rate": 0.12,
            "term_months": 60,
        },
    }


def test_calculate_endpoint(client, comparison_payload):
    # Test /api/v1 and frontend alias /api
    for prefix in ["/api/v1", "/api"]:
        response = client.post(f"{prefix}/calculate", json=comparison_payload)
        assert response.status_code == 200
        data = response.json()
        assert "isa" in data
        assert "loan" in data
        assert "summary" in data
        assert data["summary"]["winner"] in ["ISA", "Loan", "Tie"]


def test_calculate_with_no_isa_payments(client, comparison_payload):
    comparison_payload["isa"].update(
        starting_income_lpa=1, annual_income_growth_rate=0, term_months=240, max_multiple=1
    )
    comparison_payload["loan"]["annual_interest_rate"] = 0
    response = client.post("/api/calculate", json=comparison_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isa"]["total_paid"] == 0
    assert data["isa"]["effective_annual_rate"] is None
    assert data["summary"]["isa_effective_rate"] is None
    assert data["summary"]["never_pays"]
    assert data["summary"]["delta"] == -5
    assert data["loan"]["total_paid"] == 5


def test_invalid_salary_returns_json_validation_error(client, comparison_payload):
    comparison_payload["isa"]["starting_income_lpa"] = -2
    response = client.post("/api/calculate", json=comparison_payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_input"


def test_preflight_allows_only_configured_origins(client):
    headers = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"}
    allowed = client.options("/api/calculate", headers={**headers, "Origin": "http://localhost:5173"})
    denied = client.options("/api/calculate", headers={**headers, "Origin": "https://different.example"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_break_even_matches_total_and_handles_trigger_jump(client, comparison_payload):
    comparison_payload["isa"].update(income_share_pct=10, trigger_threshold_lpa=0, annual_income_growth_rate=0)
    comparison_payload["loan"]["annual_interest_rate"] = 0
    match = client.post("/api/breakeven", json=comparison_payload).json()
    assert match["status"] == "match"
    assert match["salary_lpa"] == pytest.approx(10)
    assert round(abs(match["isa_total_paid"] - match["loan_total_paid"]) * 100_000, 2) < 1

    comparison_payload["isa"]["trigger_threshold_lpa"] = 12
    jump = client.post("/api/breakeven", json=comparison_payload).json()
    assert jump["status"] == "threshold_jump"
    assert jump["salary_lpa"] is None
    assert jump["boundary_lpa"] == pytest.approx(12)


def test_custom_scenarios_and_contract_ranking(client, comparison_payload):
    response = client.post("/api/scenarios", json={**comparison_payload, "incomes": [6, 11.5]})
    assert response.status_code == 200
    scenarios = response.json()
    assert [row["label"] for row in scenarios] == ["6 LPA", "11.5 LPA"]

    contracts = [
        {**comparison_payload, "isa": {**comparison_payload["isa"], "starting_income_lpa": income}}
        for income in [6, 11.5]
    ]
    response = client.post("/api/contract-comparison", json={"contracts": contracts})
    assert response.status_code == 200
    assert [row["isa_total_paid"] for row in response.json()] == [row["isa_total_paid"] for row in scenarios]


def test_contract_sensitivity_returns_both_metrics(client, comparison_payload):
    response = client.post("/api/sensitivity", json={**comparison_payload, "axis": "cap"})
    assert response.status_code == 200
    result = response.json()
    assert result["axis"] == "cap"
    assert result["values"][0] == 1
    assert len(result["grid"]) == len(result["apr_grid"]) == len(result["incomes"])
    assert all(len(row) == len(result["values"]) for row in result["grid"] + result["apr_grid"])


def test_export_csv(client, comparison_payload):
    response = client.post("/api/export/csv", json=comparison_payload)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(StringIO(response.text)))
    assert len(rows) == 60
    assert float(rows[0]["isa_payment"]) == 0.1125
    assert float(rows[-1]["loan_closing_balance"]) == 0


def test_scenarios_endpoint(client):
    for prefix in ["/api/v1", "/api"]:
        response = client.get(f"{prefix}/scenarios")
        assert response.status_code == 200
        scenarios = response.json()
        assert isinstance(scenarios, list)
        assert len(scenarios) > 0


def test_sensitivity_endpoint(client):
    for prefix in ["/api/v1", "/api"]:
        response = client.get(f"{prefix}/sensitivity?incomes=6,9,12&rates=0.10,0.12")
        assert response.status_code == 200
        grid = response.json()
        assert grid["income_axis"] == grid["incomes"] == [6, 9, 12]
        assert grid["rate_axis"] == grid["rates"] == [0.10, 0.12]
        assert grid["delta_matrix"] == grid["grid"]
        assert [len(row) for row in grid["grid"]] == [2, 2, 2]


@pytest.mark.parametrize("query", ["rates=nan", "rates=-0.1", "incomes=inf", "incomes=1,"])
def test_sensitivity_rejects_invalid_axes(client, query):
    assert client.get(f"/api/sensitivity?{query}").status_code == 422


def test_contracts_crud(client):
    for prefix in ["/api/v1", "/api"]:
        payload = {
            "label": f"Test Contract ({prefix})",
            "isa": {
                "principal": 5.0,
                "income_share_pct": 10.0,
                "starting_income_lpa": 6.0,
                "trigger_threshold_lpa": 3.0,
                "max_multiple": 1.5,
                "term_months": 60,
                "annual_income_growth_rate": 0.08,
            },
            "loan": {
                "principal": 5.0,
                "annual_interest_rate": 0.12,
                "term_months": 60,
            },
        }

        # Create
        create_res = client.post(f"{prefix}/contracts", json=payload)
        assert create_res.status_code == 201
        created = create_res.json()
        cid = created["id"]
        assert created in client.get(f"{prefix}/contracts").json()

        # Read
        get_res = client.get(f"{prefix}/contracts/{cid}")
        assert get_res.status_code == 200
        assert get_res.json()["label"] == payload["label"]

        # Delete
        del_res = client.delete(f"{prefix}/contracts/{cid}")
        assert del_res.status_code == 200
        assert del_res.json()["deleted"] is True

