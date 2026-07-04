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

    # Enables dev-only surfaces (the legacy /realtime/decode file endpoint).
    debug: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://rtdstats:rtdstats@localhost:5432/rtdstats"
    # Server-side cap on how long any single query may run. Protects the small
    # connection pool from being pinned by runaway scans. 0 disables (useful for
    # manual backfill scripts).
    statement_timeout_ms: int = 10_000

    # ── Abuse / resource limits ───────────────────────────────────────────────
    rate_limit_enabled: bool = True
    # Per-client-IP fixed-window (60 s) request budgets, bucketed by path.
    rate_limit_default_per_minute: int = 120
    rate_limit_expensive_per_minute: int = 20
    rate_limit_export_per_minute: int = 5
    # Trust X-Forwarded-For for client identity (true when behind Caddy/Next).
    trust_proxy_headers: bool = True
    # Widest time span a single request may ask a raw-hypertable scan to cover.
    export_max_span_days: int = 31
    historical_max_span_days: int = 7
    vehicles_max_span_hours: int = 24

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
    # RTD defines on-time as within 5 minutes.
    ontime_threshold_seconds: int = 300
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
