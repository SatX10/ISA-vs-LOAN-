"""
Integration tests for FastAPI main app and API routes.
"""

from __future__ import annotations
import csv
from io import BytesIO, StringIO
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
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


def test_advanced_loan_matches_calculator_planner_scenarios_and_csv(client, comparison_payload):
    comparison_payload["loan"].update(
        annual_interest_rate=0.12, term_months=12, upfront_fee=0.05, financed_cost=0.02,
        withheld_fee=0.01, monthly_fee=0.002, grace_months=1, disbursements={"1": 2},
        rate_changes={"3": 0.15},
    )
    comparison_payload.update(monthly_budget_inr=40_000, take_home_inr=50_000,
                              essential_expenses_inr=15_000, other_debt_inr=5_000, discount_rate=0.08)
    comparison = client.post("/api/calculate", json=comparison_payload)
    assert comparison.status_code == 200
    result = comparison.json()
    loan = result["loan"]
    assert loan["initial_disbursement"] == 3
    assert loan["capitalized_interest"] == pytest.approx(0.0503)
    assert [row["payment"] for row in loan["schedule"]][:1] == [0]
    assert loan["schedule"][2]["annual_rate"] == 0.15
    assert loan["total_paid"] == pytest.approx(5.03 + loan["total_interest"] + 0.05 + 12 * 0.002)
    assert result["affordability"]["budget_inr"] == 30_000
    assert result["affordability"]["loan"]["first_over_budget_month"] == 2
    assert result["present_value"]["loan_repayment_inr"] < loan["total_paid"] * 100_000
    planner_client = TestClient(app, client=("advanced-comparison-test", 50000))
    planner = planner_client.post("/api/planner", json={**comparison_payload, "lower_salary_lpa": 3, "priority": "total_cost"})
    assert planner.status_code == 200
    assert planner.json()["plans"]["loan"]["expected_total_inr"] == pytest.approx(loan["total_paid"] * 100_000)
    scenarios = client.post("/api/scenarios", json={**comparison_payload, "incomes": [6]})
    assert scenarios.json()[0]["loan_total_paid"] == loan["total_paid"]
    exported = client.post("/api/export/csv?include_income=false", json=comparison_payload)
    rows = list(csv.DictReader(StringIO(exported.text)))
    assert rows[0]["month"] == "0"
    assert float(rows[0]["loan_upfront_fee"]) == 0.05
    assert float(rows[-1]["loan_cumulative_paid"]) == loan["total_paid"]
    assert all(row["isa_annual_income_lpa"] == "" for row in rows)


def test_paying_month_isa_can_cross_the_loan_more_than_once(client, comparison_payload):
    comparison_payload["isa"].update(
        principal=0.75, income_share_pct=10, trigger_threshold_lpa=6, max_multiple=5,
        annual_income_growth_rate=0.5, term_months=12, term_basis="paying", max_window_months=48,
    )
    comparison_payload["loan"].update(principal=0.75, annual_interest_rate=0, term_months=12)
    result = client.post("/api/breakeven", json=comparison_payload).json()
    assert result["status"] == "salary_ranges"
    winners = [region["winner"] for region in result["regions"] if region["winner"] != "Tie"]
    assert winners.count("ISA") >= 2 and winners.count("Loan") >= 2
    assert result["curve"] and result["regions"][-1]["to_lpa"] == 100


def test_portfolio_compares_funding_gaps_and_currency_stress(client, comparison_payload):
    loan = {**comparison_payload["loan"], "annual_interest_rate": 0, "term_months": 50}
    response = client.post("/api/portfolio", json={
        "funding_goal_inr": 600_000, "grants_inr": 25_000, "savings_inr": 25_000,
        "monthly_budget_inr": 10_500, "expected_salary_lpa": 6, "lower_salary_lpa": 4,
        "higher_salary_lpa": 9, "fx_shock": 0.10, "offers": [
            {"kind": "loan", "id": "a", "label": "Loan quote", "terms": loan, "foreign_currency": True},
            {"kind": "isa", "id": "b", "label": "ISA quote", "terms": comparison_payload["isa"]},
        ],
    })
    assert response.status_code == 200
    report = response.json()
    assert report["funding_needed_inr"] == 550_000
    offer = report["offers"][0]
    assert offer["remaining_gap_inr"] == 50_000
    assert offer["cases"]["expected"]["fits_budget"] is True
    assert offer["cases"]["fx_shock"]["fits_budget"] is False
    assert offer["cases"]["fx_shock"]["peak_inr"] == 11_000


def test_quote_pdf_rejects_wrong_types_and_malformed_files(client):
    assert client.post("/api/portfolio/quote-text", content=b"no PDF").status_code == 415
    response = client.post("/api/portfolio/quote-text", content=b"%PDF-1.7 broken",
                           headers={"Content-Type": "application/pdf"})
    assert response.status_code == 422


def test_quote_pdf_returns_selectable_text(client):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=200)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): DictionaryObject({
                NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }),
        }),
    })
    contents = DecodedStreamObject()
    contents.set_data(b"BT /F1 12 Tf 20 150 Td (Annual interest rate: 10.5%) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(contents)
    output = BytesIO()
    writer.write(output)
    response = client.post("/api/portfolio/quote-text", content=output.getvalue(),
                           headers={"Content-Type": "application/pdf"})
    assert response.status_code == 200
    assert "Annual interest rate: 10.5%" in response.json()["text"]


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

