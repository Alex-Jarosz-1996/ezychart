import asyncio
import json
import os
from collections.abc import AsyncGenerator

import httpx
from dotenv import load_dotenv

from services import mcp_service

load_dotenv()

_SYSTEM_PROMPT = (
    "You are a concise financial research assistant. "
    "Use the available tools to answer questions about stock prices, "
    "analyst consensus, and market performance. "
    "Always cite the data you retrieve. Keep answers focused and brief."
)

_OR_API_KEY = os.environ.get("OPENROUTER_API_KEY")
_OR_MODEL = os.environ.get("OPENROUTER_MODEL")
_OR_URL = "https://openrouter.ai/api/v1/chat/completions"
_OR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "quote",
            "description": (
                "Get the current stock quote for a ticker symbol, including price, "
                "change, analyst consensus, and key trading data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "endpoint": {"type": "string", "enum": ["quote"]},
                    "symbol": {
                        "type": "string",
                        "description": "Stock ticker symbol, e.g. AAPL, NVDA, TSLA",
                    },
                },
                "required": ["endpoint", "symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "marketPerformance",
            "description": (
                "Get market-wide performance data: biggest gainers, "
                "biggest losers, or most actively traded stocks today."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "endpoint": {
                        "type": "string",
                        "enum": ["biggest-gainers", "biggest-losers", "most-active"],
                    },
                },
                "required": ["endpoint"],
            },
        },
    },
]


async def _execute_tool_call(tc: dict) -> dict:
    fn = tc["function"]
    args = json.loads(fn["arguments"])
    result = await mcp_service.call_tool(fn["name"], args)
    return {"role": "tool", "tool_call_id": tc["id"], "content": result}


async def chat_stream(message: str, history: list[dict]) -> AsyncGenerator[str, None]:
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": message},
    ]

    async with httpx.AsyncClient(timeout=60) as client:
        # Resolve tool calls with non-streaming requests (fast, structured responses).
        # Break as soon as a turn produces no tool calls — that turn's text will be
        # re-requested as a stream so the user sees tokens as they arrive.
        had_tool_calls = False
        for _ in range(5):
            resp = await client.post(
                _OR_URL,
                headers={"Authorization": f"Bearer {_OR_API_KEY}"},
                json={"model": _OR_MODEL, "messages": messages, "tools": _OR_TOOLS},
            )
            resp.raise_for_status()
            msg = resp.json()["choices"][0]["message"]

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                if not had_tool_calls:
                    # No tools used at all — yield the response we already have.
                    yield msg.get("content") or ""
                    return
                # Tools were used; discard this response and re-request as a stream.
                break

            had_tool_calls = True
            messages.append(msg)
            tool_results = await asyncio.gather(*[
                _execute_tool_call(tc) for tc in tool_calls
            ])
            messages.extend(tool_results)

        # Stream the final text response (tools omitted so model generates prose).
        async with client.stream(
            "POST", _OR_URL,
            headers={"Authorization": f"Bearer {_OR_API_KEY}"},
            json={"model": _OR_MODEL, "messages": messages, "stream": True},
            timeout=60,
        ) as stream_resp:
            stream_resp.raise_for_status()
            async for line in stream_resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data.strip() == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0]["delta"].get("content")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError):
                    pass
