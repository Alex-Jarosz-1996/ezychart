from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


# --- GET /api/mcp/tools ---


def test_get_tools_requires_auth(client: TestClient):
    response = client.get("/api/mcp/tools")
    assert response.status_code in (401, 403)


def test_get_tools_returns_502_when_service_unavailable(
    client: TestClient, auth_headers
):
    # mcp_service.list_tools does not exist; the route catches AttributeError → 502
    response = client.get("/api/mcp/tools", headers=auth_headers)
    assert response.status_code == 502
    assert "FMP MCP" in response.json()["detail"]


# --- POST /api/mcp/call ---


def test_call_tool_requires_auth(client: TestClient):
    response = client.post(
        "/api/mcp/call", json={"name": "quote", "arguments": {"symbol": "AAPL"}}
    )
    assert response.status_code in (401, 403)


def test_call_tool_returns_result(client: TestClient, auth_headers, mocker):
    mock = AsyncMock(return_value='{"price": 189.5}')
    mocker.patch("services.mcp_service.call_tool", mock)

    response = client.post(
        "/api/mcp/call",
        json={"name": "quote", "arguments": {"symbol": "AAPL"}},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"] == '{"price": 189.5}'
    mock.assert_awaited_once_with("quote", {"symbol": "AAPL"})


def test_call_tool_returns_502_on_service_error(
    client: TestClient, auth_headers, mocker
):
    mock = AsyncMock(side_effect=Exception("MCP unreachable"))
    mocker.patch("services.mcp_service.call_tool", mock)

    response = client.post(
        "/api/mcp/call",
        json={"name": "quote", "arguments": {}},
        headers=auth_headers,
    )

    assert response.status_code == 502
    assert "FMP MCP" in response.json()["detail"]


def test_call_tool_accepts_empty_arguments(client: TestClient, auth_headers, mocker):
    mock = AsyncMock(return_value="[]")
    mocker.patch("services.mcp_service.call_tool", mock)

    response = client.post(
        "/api/mcp/call",
        json={"name": "marketPerformance"},
        headers=auth_headers,
    )

    assert response.status_code == 200


def test_call_tool_rejects_missing_name(client: TestClient, auth_headers):
    response = client.post(
        "/api/mcp/call",
        json={"arguments": {"symbol": "AAPL"}},
        headers=auth_headers,
    )
    assert response.status_code == 422
