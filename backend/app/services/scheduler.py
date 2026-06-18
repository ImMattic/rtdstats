"""APScheduler setup – runs the GTFS-RT ingest loop."""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.services.ingestion import ingest_cycle

logger = logging.getLogger(__name__)

_settings = get_settings()

scheduler = AsyncIOScheduler(timezone="UTC")


def start_scheduler() -> None:
    scheduler.add_job(
        ingest_cycle,
        trigger=IntervalTrigger(seconds=_settings.polling_interval_seconds),
        id="gtfs_rt_ingest",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started – polling every %ds", _settings.polling_interval_seconds
    )


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
