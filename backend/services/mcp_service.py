import os
from typing import Any

from dotenv import load_dotenv
from fastmcp import Client

load_dotenv()

_FMP_MCP_URL = (
    f"https://financialmodelingprep.com/mcp?apikey={os.environ.get('FMP_API_KEY', '')}"
)


async def call_tool(name: str, arguments: dict[str, Any]) -> str:
    arguments.setdefault("endpoint", name)
    async with Client(_FMP_MCP_URL) as client:
        result = await client.call_tool(name, arguments)
        content = result.content if hasattr(result, "content") else result
        return content[0].text if content else ""
