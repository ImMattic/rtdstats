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
engine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=not _is_sqlite,
    # A single uvicorn process can't saturate 30 connections, and each idle one
    # costs DB memory on the small VM. 5 + 10 overflow is ample headroom.
    # SQLite (used in tests) uses a StaticPool and doesn't support these args.
    **({} if _is_sqlite else {"pool_size": 5, "max_overflow": 10}),
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
