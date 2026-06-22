"""Async HTTP fetcher for RTD GTFS-RT protobuf feeds."""
from __future__ import annotations

import logging

import aiohttp

logger = logging.getLogger(__name__)

_TIMEOUT = aiohttp.ClientTimeout(total=15)

# Tracks Last-Modified per URL so we can send If-Modified-Since on the next poll.
_last_modified: dict[str, str] = {}


async def fetch_pb(url: str) -> bytes | None:
    """Fetch a protobuf binary from *url* and return the raw bytes.

    Returns ``None`` if the server responds 304 (feed unchanged since last poll).
    Raises :class:`aiohttp.ClientError` on network/HTTP failures.
    """
    headers: dict[str, str] = {}
    if url in _last_modified:
        headers["If-Modified-Since"] = _last_modified[url]

    async with aiohttp.ClientSession(timeout=_TIMEOUT) as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status == 304:
                logger.debug("Feed unchanged at %s (304 Not Modified)", url)
                return None
            resp.raise_for_status()
            data = await resp.read()
            lm = resp.headers.get("Last-Modified")
            if lm:
                _last_modified[url] = lm
            logger.debug("Fetched %d bytes from %s", len(data), url)
            return data
