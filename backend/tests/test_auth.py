import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient


def test_login_valid_password_returns_token(client: TestClient):
    response = client.post("/api/auth/login", json={"password": "test_password"})

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    payload = jwt.decode(
        data["access_token"], os.environ["JWT_SECRET"], algorithms=["HS256"]
    )
    assert "exp" in payload


def test_login_wrong_password_returns_401(client: TestClient):
    response = client.post("/api/auth/login", json={"password": "wrong"})

    assert response.status_code == 401
    assert "Invalid password" in response.json()["detail"]


def test_protected_route_without_token_returns_401(client: TestClient):
    response = client.get("/api/quote/AAPL")

    assert response.status_code == 401


def test_health_endpoint_returns_ok(client: TestClient):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_protected_route_with_invalid_token_returns_401(client: TestClient):
    response = client.get(
        "/api/quote/AAPL", headers={"Authorization": "Bearer notavalidtoken"}
    )

    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


def test_protected_route_with_expired_token_returns_401(client: TestClient, mocker):
    from tests.conftest import MOCK_QUOTE

    mocker.patch("services.finnhub_service.get_quote", return_value=MOCK_QUOTE)

    expired_payload = {"exp": datetime.now(timezone.utc) - timedelta(hours=1)}
    expired_token = jwt.encode(
        expired_payload, os.environ["JWT_SECRET"], algorithm="HS256"
    )

    response = client.get(
        "/api/quote/AAPL", headers={"Authorization": f"Bearer {expired_token}"}
    )

    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()
