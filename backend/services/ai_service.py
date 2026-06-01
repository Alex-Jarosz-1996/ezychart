import json
import os

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


async def chat(message: str) -> str:
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ]

    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(5):
            resp = await client.post(
                _OR_URL,
                headers={"Authorization": f"Bearer {_OR_API_KEY}"},
                json={"model": _OR_MODEL, "messages": messages, "tools": _OR_TOOLS},
            )
            resp.raise_for_status()
            choice = resp.json()["choices"][0]
            msg = choice["message"]
            messages.append(msg)

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                break

            for tc in tool_calls:
                fn = tc["function"]
                args = json.loads(fn["arguments"])
                result = await mcp_service.call_tool(fn["name"], args)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result,
                    }
                )

    return messages[-1].get("content") or ""
