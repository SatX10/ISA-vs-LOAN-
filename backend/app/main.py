"""FastAPI application and optional production frontend."""

from contextlib import asynccontextmanager
from math import isfinite
from os import getenv
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app import db
from app.limiter import limiter
from app.routers import calculate, export, scenarios, sensitivity

FRONTEND_ROUTES = (
    "/", "/scenarios", "/sensitivity", "/break-even", "/saved",
    "/contract-checker", "/methodology", "/export",
)


def create_app(frontend_dir: Path | None = None, shared_contracts: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if frontend_dir is not None and not index.is_file():
            raise RuntimeError(f"Frontend build missing at {index}")
        if shared_contracts:
            db.init_db()
        yield

    application = FastAPI(
        title="ISA vs Loan API",
        description="Compare monthly ISA and education loan payments.",
        version="1.0.0",
        lifespan=lifespan,
    )
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    application.add_middleware(SlowAPIMiddleware)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        details = jsonable_encoder(
            error.errors(), custom_encoder={float: lambda value: value if isfinite(value) else str(value)}
        )
        return JSONResponse(
            status_code=422,
            content={"detail": details, "error": {"code": "invalid_input", "message": "Check the supplied values."}},
        )

    default_origins = "http://localhost:5173,http://127.0.0.1:5173" if frontend_dir is None else ""
    origins = [origin.strip() for origin in getenv("ALLOWED_ORIGINS", default_origins).split(",") if origin.strip()]
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type"],
        )

    for prefix in ("/api", "/api/v1"):
        for router in (
            calculate.router, calculate.break_even_router, scenarios.router,
            sensitivity.router, export.router,
        ):
            application.include_router(router, prefix=prefix)
        if shared_contracts:
            application.include_router(export.contracts_router, prefix=prefix)

    @application.get("/api/health", tags=["meta"])
    @application.get("/health", include_in_schema=False)
    async def health() -> dict:
        return {"status": "ok", "version": application.version}

    if frontend_dir is not None:
        index = frontend_dir / "index.html"
        application.mount("/assets", StaticFiles(directory=frontend_dir / "assets"), name="assets")

        def frontend_page() -> FileResponse:
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

        for path in FRONTEND_ROUTES:
            application.add_api_route(path, frontend_page, methods=["GET", "HEAD"], include_in_schema=False)

    return application


app = create_app()
