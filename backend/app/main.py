import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api import v1_router
from app.api.v1.routes import warm_shape_cache
from app.config import get_settings
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── Legacy decode endpoint (kept for backwards-compat / dev convenience) ───

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
