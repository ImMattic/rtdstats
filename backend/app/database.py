from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

_settings = get_settings()

_is_sqlite = _settings.database_url.startswith("sqlite")

_pg_kwargs: dict = {
    "pool_size": 5,
    "max_overflow": 10,
}
if _settings.statement_timeout_ms > 0:
    # asyncpg applies these per-connection; values must be strings. A server-side
    # statement_timeout means no request can pin a pool connection indefinitely.
    _pg_kwargs["connect_args"] = {
        "server_settings": {
            "statement_timeout": str(_settings.statement_timeout_ms),
            "idle_in_transaction_session_timeout": "15000",
        }
    }

engine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=not _is_sqlite,
    # A single uvicorn process can't saturate 30 connections, and each idle one
    # costs DB memory on the small VM. 5 + 10 overflow is ample headroom.
    # SQLite (used in tests) uses a StaticPool and doesn't support these args.
    **({} if _is_sqlite else _pg_kwargs),
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
