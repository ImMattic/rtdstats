"""Async HTTP fetcher for RTD GTFS-RT protobuf feeds."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import aiohttp

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

_TIMEOUT = aiohttp.ClientTimeout(total=15)


async def fetch_pb(url: str) -> bytes:
    """Fetch a protobuf binary from *url* and return the raw bytes.

    Raises :class:`aiohttp.ClientError` on network/HTTP failures.
    """
    async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.read()
            logger.debug("Fetched %d bytes from %s", len(data), url)
            return data
