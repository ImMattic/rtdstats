import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import DBAPIError

from app.api import v1_router
from app.api.v1.routes import warm_shape_cache
from app.config import get_settings
from app.middleware.rate_limit import RateLimitMiddleware
from app.services.gtfs_decoder import decode_vehicle_positions
from app.services.scheduler import start_scheduler, stop_scheduler

_settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()

    # Parse ~35 MB of GTFS shape CSVs once, in a worker thread, so the first
    # bus-click / rail-line request doesn't block the event loop for seconds.
    async def _warm() -> None:
        try:
            await asyncio.to_thread(warm_shape_cache)
            logger.info("Route-shape cache warmed")
        except Exception:
            logger.exception("Failed to warm route-shape cache")

    warm_task = asyncio.create_task(_warm())
    yield
    warm_task.cancel()
    stop_scheduler()


app = FastAPI(
    title="RTD Stats API",
    version="0.1.0",
    lifespan=lifespan,
)

# Middleware ordering: add_middleware() makes the last-added layer outermost.
# CORS must be outermost so even 429s from the rate limiter carry CORS headers.
if _settings.rate_limit_enabled:
    app.add_middleware(RateLimitMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# How long browsers may reuse a response without re-fetching, by path prefix.
# Realtime matches the 5 s server cache; routes/shapes are static per deploy.
_CACHE_CONTROL_RULES = (
    ("/api/v1/realtime/", "public, max-age=5"),
    ("/api/v1/stats/", "public, max-age=60"),
    ("/api/v1/routes", "public, max-age=3600"),
)


@app.middleware("http")
async def _cache_control(request: Request, call_next) -> Response:
    response = await call_next(request)
    if request.method == "GET" and response.status_code == 200:
        for prefix, value in _CACHE_CONTROL_RULES:
            if request.url.path.startswith(prefix):
                response.headers.setdefault("Cache-Control", value)
                break
    return response


@app.exception_handler(DBAPIError)
async def _db_timeout_handler(request: Request, exc: DBAPIError) -> JSONResponse:
    # statement_timeout cancellations surface as QueryCanceledError; report them
    # as a gateway timeout instead of a 500 traceback. Anything else re-raises.
    if "QueryCanceled" in type(exc.orig).__name__:
        logger.warning("Query timed out: %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=504,
            content={"detail": "query timed out — narrow the time range and retry"},
        )
    raise exc

app.include_router(v1_router)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── Legacy decode endpoint (dev-only: reads arbitrary filesystem paths) ────

if _settings.debug:
    @app.get("/api/v1/realtime/decode", tags=["realtime"])
    def decode_realtime(pb_file: str | None = None) -> dict[str, Any]:
        project_root = _project_root()
        pb_path = Path(pb_file) if pb_file else project_root / "gtfs-realtime" / "VehiclePosition.pb"

        if not pb_path.exists():
            raise HTTPException(status_code=404, detail=f"protobuf file not found: {pb_path}")

        try:
            output = decode_vehicle_positions(
                pb_file=pb_path,
                gtfs_static_root=project_root / "gtfs-static",
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"decode failed: {exc}") from exc

        return {
            "source": str(pb_path),
            "counts": {k: len(v) for k, v in output.items()},
            "data": output,
        }
