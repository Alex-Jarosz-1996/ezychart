import asyncio
import json
import os
from typing import Any

import redis.asyncio as aioredis
from dotenv import load_dotenv
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

load_dotenv()

_FMP_MCP_URL = "https://financialmodelingprep.com/mcp"
_FMP_API_KEY = os.environ.get("FMP_API_KEY", "")

# TTLs in seconds per tool name
_CACHE_TTL = {"quote": 60, "marketPerformance": 120}

_client: Client | None = None
_lock = asyncio.Lock()
_redis: aioredis.Redis = aioredis.from_url(
    os.environ.get("REDIS_URL", "redis://localhost:6379"),
    decode_responses=True,
)


async def _get_client() -> Client:
    global _client
    if _client is not None:
        return _client
    async with _lock:
        if _client is None:
            transport = StreamableHttpTransport(_FMP_MCP_URL, auth=_FMP_API_KEY)
            c = Client(transport)
            await c.__aenter__()
            _client = c
    return _client


async def call_tool(name: str, arguments: dict[str, Any]) -> str:
    global _client
    arguments.setdefault("endpoint", name)

    cache_key = f"fmp:{name}:{json.dumps(arguments, sort_keys=True)}"
    ttl = _CACHE_TTL.get(name, 60)

    cached = await _redis.get(cache_key)
    if cached:
        return cached

    try:
        client = await _get_client()
        result = await client.call_tool(name, arguments)
    except Exception:
        _client = None  # force reconnect on next call
        raise

    content = result.content if hasattr(result, "content") else result
    text = content[0].text if content else ""

    await _redis.setex(cache_key, ttl, text)
    return text
