"""Serve the built frontend and API on a single production port."""

from os import getenv
from pathlib import Path

import uvicorn

from app.main import create_app


def production_app():
    default_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return create_app(Path(getenv("FRONTEND_DIST", default_dir)), shared_contracts=False)


if __name__ == "__main__":
    uvicorn.run(
        "app.production:production_app",
        factory=True,
        host=getenv("HOST", "0.0.0.0"),
        port=int(getenv("PORT", "10000")),
    )
