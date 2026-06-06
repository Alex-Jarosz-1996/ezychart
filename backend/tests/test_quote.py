from fastapi.testclient import TestClient

from tests.conftest import MOCK_QUOTE


def test_quote_returns_200_with_correct_shape(client: TestClient, auth_headers, mocker):
    mocker.patch("services.finnhub_service.get_quote", return_value=MOCK_QUOTE)

    response = client.get("/api/quote/AAPL", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "AAPL"
    assert data["current"] == 189.50
    assert data["high"] == 191.00
    assert data["low"] == 187.30
    assert data["open"] == 188.00


def test_quote_symbol_is_uppercased(client: TestClient, auth_headers, mocker):
    mocker.patch("services.finnhub_service.get_quote", return_value=MOCK_QUOTE)

    response = client.get("/api/quote/aapl", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["symbol"] == "AAPL"


def test_quote_returns_404_for_unknown_symbol(client: TestClient, auth_headers, mocker):
    mocker.patch(
        "services.finnhub_service.get_quote",
        return_value={"c": 0, "h": 0, "l": 0, "o": 0},
    )

    response = client.get("/api/quote/ZZZZZ", headers=auth_headers)

    assert response.status_code == 404
    assert "ZZZZZ" in response.json()["detail"]


def test_quote_returns_404_when_no_data(client: TestClient, auth_headers, mocker):
    mocker.patch("services.finnhub_service.get_quote", return_value={})

    response = client.get("/api/quote/AAPL", headers=auth_headers)

    assert response.status_code == 404


def test_quote_returns_502_on_finnhub_error(client: TestClient, auth_headers, mocker):
    mocker.patch(
        "services.finnhub_service.get_quote", side_effect=Exception("API unavailable")
    )

    response = client.get("/api/quote/AAPL", headers=auth_headers)

    assert response.status_code == 502


def test_quote_returns_429_on_rate_limit(client: TestClient, auth_headers, mocker):
    from services.finnhub_service import FinnhubRateLimitError

    mocker.patch(
        "services.finnhub_service.get_quote",
        side_effect=FinnhubRateLimitError("rate limited"),
    )

    response = client.get("/api/quote/AAPL", headers=auth_headers)

    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"].lower()


def test_quote_returns_401_without_token(client: TestClient):
    response = client.get("/api/quote/AAPL")

    assert response.status_code == 401
