from fastapi.testclient import TestClient

from app import db
from app.production import production_app


def test_production_serves_frontend_and_api_without_sqlite(tmp_path, monkeypatch):
    monkeypatch.setenv("FRONTEND_DIST", str(tmp_path))
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "unneeded.db")
    (tmp_path / "index.html").write_text("<title>ISA Truth</title>", encoding="utf-8")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "index.js").write_text("export {};", encoding="utf-8")

    with TestClient(production_app()) as client:
        for path in (
            "/", "/scenarios", "/break-even", "/saved", "/contract-checker", "/methodology", "/about",
            "/loan-rules", "/planning", "/dream-path", "/planner", "/data-and-sharing",
        ):
            page = client.get(path)
            assert page.status_code == 200
            assert "<title>ISA Truth</title>" in page.text
        assert client.get("/assets/index.js").text == "export {};"
        assert client.get("/api/health").json()["status"] == "ok"
        assert client.get("/api/contracts").status_code == 404
        assert client.get("/api/missing-route").status_code == 404

    assert not db.DB_PATH.exists()
