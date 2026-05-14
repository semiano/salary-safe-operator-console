from fastapi import FastAPI

from app.api.routes_admin import router as admin_router
from app.api.routes_apply import router as apply_router
from app.api.routes_applications import router as applications_router
from app.api.routes_auth import router as auth_router
from app.api.routes_cases import router as cases_router
from app.api.routes_configs import router as configs_router
from app.api.routes_job_listings import router as job_listings_router
from app.api.routes_phase1_bids import router as phase1_bids_router
from app.api.routes_prompts import router as prompts_router
from app.api.routes_public_bid import router as public_bid_router
from app.api.routes_runs import router as runs_router
from app.api.routes_ws import router as ws_router
from app.core.logging import configure_logging
from app.core.settings import get_settings

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title="SalarySafe Backend", version="0.1.0")


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


@app.get("/api/health", tags=["system"])
def api_health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


app.include_router(auth_router, prefix="/api")
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
