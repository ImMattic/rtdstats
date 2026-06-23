from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://rtdstats:rtdstats@localhost:5432/rtdstats"

    # ── RTD GTFS-RT feed URLs ─────────────────────────────────────────────────
    gtfs_rt_vehicle_url: str = (
        "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb"
    )
    gtfs_rt_trip_url: str = (
        "https://www.rtd-denver.com/files/gtfs-rt/TripUpdate.pb"
    )

    # ── Ingestion scheduler ───────────────────────────────────────────────────
    polling_interval_seconds: int = 30

    # ── Alert thresholds ─────────────────────────────────────────────────────
    stuck_vehicle_minutes: int = 12

    # ── On-time performance (observed position vs. static schedule) ──────────
    # A vehicle counts as "arrived" at a timepoint when within this many metres
    # of it; the observed arrival time is then compared to the scheduled time.
    arrival_radius_m: int = 100
    # An arrival within ±this many seconds of schedule is "on time".
    ontime_threshold_seconds: int = 120
    # Sanity guard: if the best schedule match is off by more than this, the
    # live trip_id probably doesn't match the static schedule for that day —
    # drop the event rather than record a bogus delay.
    arrival_max_delay_seconds: int = 10800

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> list[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v  # type: ignore[return-value]


@lru_cache
def get_settings() -> Settings:
    return Settings()
