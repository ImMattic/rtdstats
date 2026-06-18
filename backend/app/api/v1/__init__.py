from fastapi import APIRouter

from app.api.v1 import realtime, historical, routes, stats, export

router = APIRouter(prefix="/api/v1")
router.include_router(realtime.router)
router.include_router(historical.router)
router.include_router(routes.router)
router.include_router(stats.router)
router.include_router(export.router)
