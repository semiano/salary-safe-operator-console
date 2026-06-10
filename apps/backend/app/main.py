import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.api.routes_admin import router as admin_router
from app.api.routes_apply import router as apply_router
from app.api.routes_applications import router as applications_router
from app.api.routes_auth import router as auth_router
from app.api.routes_benchmark import router as benchmark_router
from app.api.routes_cases import router as cases_router
from app.api.routes_tenants import router as tenants_router
from app.api.routes_configs import router as configs_router
from app.api.routes_job_listings import router as job_listings_router
from app.api.routes_phase1_bids import router as phase1_bids_router
from app.api.routes_prompts import router as prompts_router
from app.api.routes_public_bid import router as public_bid_router
from app.api.routes_runs import router as runs_router
from app.api.routes_ws import router as ws_router
from app.core.db import SessionLocal
from app.core.logging import configure_logging
from app.core.settings import get_settings

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title="SalarySafe Backend", version="0.1.0")


def _db_available() -> bool:
    """Run a lightweight DB roundtrip and return readiness state."""
    session = SessionLocal()
    try:
        session.execute(text("SELECT 1"))
        return True
    except OperationalError:
        return False
    finally:
        session.close()


@app.on_event("startup")
def startup_db_check() -> None:
    if not _db_available():
        logger.error("Database connectivity check failed at startup")


@app.exception_handler(OperationalError)
async def operational_error_handler(_: Request, __: OperationalError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database unavailable"})


@app.get("/health", tags=["system"])
def health() -> JSONResponse:
    if _db_available():
        return JSONResponse(status_code=200, content={"status": "ok", "env": settings.app_env})
    return JSONResponse(status_code=503, content={"status": "degraded", "env": settings.app_env, "db": "unavailable"})


@app.get("/api/health", tags=["system"])
def api_health() -> JSONResponse:
    if _db_available():
        return JSONResponse(status_code=200, content={"status": "ok", "env": settings.app_env})
    return JSONResponse(status_code=503, content={"status": "degraded", "env": settings.app_env, "db": "unavailable"})


app.include_router(auth_router, prefix="/api")
app.include_router(tenants_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(phase1_bids_router, prefix="/api")
app.include_router(job_listings_router, prefix="/api")
app.include_router(applications_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(prompts_router, prefix="/api")
app.include_router(configs_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(ws_router)
app.include_router(public_bid_router, prefix="/api")
app.include_router(apply_router, prefix="/api")
app.include_router(benchmark_router, prefix="/api")
