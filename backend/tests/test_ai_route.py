import json

import pytest
from fastapi.testclient import TestClient


async def _stream_chunks(*chunks):
    """Async generator that yields the given string chunks."""
    for chunk in chunks:
        yield chunk


async def _stream_error(message, history):
    yield "partial"
    raise RuntimeError("upstream failure")


def _parse_sse(content: str) -> list[dict]:
    """Parse SSE text into a list of data payloads."""
    events = []
    for line in content.splitlines():
        if line.startswith("data: "):
            payload = line[6:]
            if payload == "[DONE]":
                events.append({"done": True})
            else:
                events.append(json.loads(payload))
    return events


# --- POST /api/chat ---


def test_chat_requires_auth(client: TestClient):
    response = client.post("/api/chat", json={"message": "hi", "history": []})
    assert response.status_code in (401, 403)


def test_chat_streams_sse_tokens(client: TestClient, auth_headers, mocker):
    mocker.patch(
        "services.ai_service.chat_stream",
        new=lambda msg, hist: _stream_chunks("Hello", " world"),
    )

    response = client.post(
        "/api/chat",
        json={"message": "hello", "history": []},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    events = _parse_sse(response.content.decode())
    tokens = [e["token"] for e in events if "token" in e]
    assert tokens == ["Hello", " world"]


def test_chat_always_ends_with_done(client: TestClient, auth_headers, mocker):
    mocker.patch(
        "services.ai_service.chat_stream",
        new=lambda msg, hist: _stream_chunks("ok"),
    )

    response = client.post(
        "/api/chat",
        json={"message": "ping", "history": []},
        headers=auth_headers,
    )

    assert response.content.decode().endswith("data: [DONE]\n\n")


def test_chat_emits_error_event_on_service_failure(
    client: TestClient, auth_headers, mocker
):
    mocker.patch("services.ai_service.chat_stream", new=_stream_error)

    response = client.post(
        "/api/chat",
        json={"message": "hi", "history": []},
        headers=auth_headers,
    )

    assert response.status_code == 200
    events = _parse_sse(response.content.decode())
    error_events = [e for e in events if "error" in e]
    assert len(error_events) == 1
    assert "AI service error" in error_events[0]["error"]


def test_chat_rejects_message_exceeding_max_length(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.ai_service.chat_stream",
        new=lambda msg, hist: _stream_chunks("ok"),
    )

    response = client.post(
        "/api/chat",
        json={"message": "x" * 2001, "history": []},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_chat_passes_history_to_service(client: TestClient, auth_headers, mocker):
    captured: list = []

    async def _capture(message, history):
        captured.append((message, history))
        yield "ok"

    mocker.patch("services.ai_service.chat_stream", new=_capture)

    history = [{"role": "user", "content": "prev msg"}]
    client.post(
        "/api/chat",
        json={"message": "new msg", "history": history},
        headers=auth_headers,
    )

    assert len(captured) == 1
    assert captured[0][0] == "new msg"
    assert captured[0][1] == [{"role": "user", "content": "prev msg"}]
