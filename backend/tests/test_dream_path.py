import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.limiter import limiter
from app.main import create_app


DATA_GOAL = "I want to become a data scientist after Class 12 and study in India. My total budget is ₹6 lakh."
PROFILE = {
    "subject": "data", "level": "undergraduate", "stage": "class_12",
    "budget_inr": 500_000, "other_costs_inr": 40_000, "available_funds_inr": 100_000,
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ACCOUNT_DB_PATH", str(tmp_path / "dream.db"))
    for name in ("DATABASE_URL", "RENDER", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    limiter.reset()
    with TestClient(create_app(shared_contracts=False)) as client:
        yield client
    limiter.reset()


def test_local_interpretation_prompts_for_unknown_details(client):
    response = client.post("/api/dream/interpret", json={"goal": DATA_GOAL})
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {"mode": "local", "fields": {
        "subject": "data", "stage": "school", "level": "undergraduate", "market": "india", "budget_inr": 600_000,
    }}
    vague = client.post("/api/dream/interpret", json={"goal": "I want to become a pilot and study for up to 3 years."})
    assert vague.json()["fields"] == {}
    foreign = client.post("/api/dream/interpret", json={"goal": "Study software abroad. My budget is 50k USD."})
    assert foreign.json()["fields"] == {"subject": "software", "market": "elsewhere"}
    plain = client.post("/api/dream/interpret", json={"goal": "I want to study computer science. My budget is 650000."})
    assert plain.json()["fields"] == {"subject": "software", "budget_inr": 650_000}
    spaced = client.post("/api/dream/interpret", json={"goal": "I want to study design with a budget of ₹ 6 lakh."})
    assert spaced.json()["fields"] == {"subject": "design", "budget_inr": 600_000}
    blocked = client.post("/api/dream/interpret", headers={"Origin": "https://unrelated.example"}, json={"goal": DATA_GOAL})
    assert blocked.status_code == 403


def test_recommendations_rank_verified_fees_and_preserve_cost_assumptions(client):
    response = client.post("/api/dream/recommend", json=PROFILE)
    assert response.status_code == 200
    paths = response.json()["recommendations"]
    assert [path["id"] for path in paths] == ["iitm-data", "ignou-bca", "bits-cs"]
    best = paths[0]
    assert best["budget_status"] == "within"
    assert best["total_inr"] == [426_000, 490_000]
    assert best["gap_inr"] == [326_000, 390_000]
    assert best["financing_inr"] == 390_000
    assert all(path["sources"] and all(url.startswith("https://") for _, url in path["sources"]) for path in paths)
    assert paths[1]["gap_inr"] == [0, 0] and paths[1]["financing_inr"] is None
    assert paths[2]["budget_status"] == "fees_unknown" and paths[2]["financing_inr"] is None

    tighter = client.post("/api/dream/recommend", json={**PROFILE, "budget_inr": 440_000}).json()["recommendations"]
    assert tighter[0]["id"] == "ignou-bca"
    assert next(path for path in tighter if path["id"] == "iitm-data")["budget_status"] == "range"
    incomplete = client.post("/api/dream/recommend", json={**PROFILE, "other_costs_inr": None}).json()["recommendations"][0]
    assert incomplete["budget_status"] == "fees_only" and incomplete["total_inr"] is None
    assert incomplete["gap_inr"] == [286_000, 350_000]
    assert incomplete["financing_inr"] == 350_000

    early = client.post("/api/dream/recommend", json={"subject": "software"}).json()["recommendations"]
    assert early[0]["entry_status"] == "review" and early[0]["budget_status"] == "no_budget"
    assert early[0]["gap_inr"] == early[0]["fees_inr"]
    assert len({path["level"] for path in early}) == 2


def test_recommendations_respect_catalog_scope_format_and_entry_requirements(client):
    assert client.post("/api/dream/recommend", json={**PROFILE, "market": "elsewhere"}).json()["reason"] == "market"
    assert client.post("/api/dream/recommend", json={**PROFILE, "mode": "campus"}).json()["reason"] == "format"
    assert client.post("/api/dream/recommend", json={**PROFILE, "subject": "design", "level": "postgraduate"}).json()["reason"] == "subject_level"
    electronics = client.post("/api/dream/recommend", json={**PROFILE, "subject": "electronics", "physics_and_math": "no"}).json()
    assert electronics["recommendations"][0]["entry_status"] == "subject_gap"
    graduate = client.post("/api/dream/recommend", json={**PROFILE, "level": "postgraduate"}).json()
    assert graduate["recommendations"][0]["entry_status"] == "complete_bachelors"


def test_ai_is_opt_in_and_only_extracts_editable_fields(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    assert client.post("/api/dream/interpret", json={"goal": DATA_GOAL, "use_ai": True}).status_code == 401
    signup = client.post("/api/auth/sign-up", json={
        "email": "dream@example.test", "display_name": "Private Name", "password": "test-dream-password",
    })
    assert signup.status_code == 201

    def model(url, **options):
        assert options["json"]["store"] is False
        assert json.loads(options["json"]["input"]) == {"goal": DATA_GOAL}
        return httpx.Response(200, request=httpx.Request("POST", url), json={"output": [
            {"content": [{"type": "output_text", "text": json.dumps({
                "subject": "data", "stage": "school", "budget_inr": -1, "programs": ["Invented University"],
            })}]},
        ]})

    monkeypatch.setattr("app.ai.httpx.post", model)
    assisted = client.post("/api/dream/interpret", json={"goal": DATA_GOAL, "use_ai": True}).json()
    assert assisted["mode"] == "ai"
    assert assisted["fields"]["budget_inr"] == 600_000
    assert "programs" not in assisted["fields"]

    def unavailable(*args, **kwargs):
        raise httpx.ReadTimeout("Provider unavailable")

    monkeypatch.setattr("app.ai.httpx.post", unavailable)
    fallback = client.post("/api/dream/interpret", json={"goal": DATA_GOAL, "use_ai": True}).json()
    assert fallback == {"mode": "fallback", "fields": assisted["fields"]}
