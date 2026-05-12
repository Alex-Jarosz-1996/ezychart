from fastapi.testclient import TestClient

from services.options_service import OptionsRateLimitError

MOCK_OPTIONS = {
    "symbol": "AAPL",
    "calls": [{"ticker": "O:AAPL260511C00235000", "expiration_date": "2026-05-11"}],
    "puts": [{"ticker": "O:AAPL260511P00235000", "expiration_date": "2026-05-11"}],
}

MOCK_EMPTY = {"symbol": "ZZZZZ", "calls": [], "puts": []}


def test_options_returns_200_with_correct_shape(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.options_service.get_options_chain", return_value=MOCK_OPTIONS
    )

    response = client.get("/api/options/AAPL", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["calls"][0]["ticker"] == "O:AAPL260511C00235000"
    assert body["calls"][0]["expiration_date"] == "2026-05-11"
    assert body["puts"][0]["ticker"] == "O:AAPL260511P00235000"


def test_options_symbol_is_uppercased(client: TestClient, auth_headers, mocker):
    spy = mocker.patch(
        "services.options_service.get_options_chain", return_value=MOCK_OPTIONS
    )

    client.get("/api/options/aapl", headers=auth_headers)

    spy.assert_called_once_with("AAPL", strike_price=None)


def test_options_returns_404_when_empty(client: TestClient, auth_headers, mocker):
    mocker.patch("services.options_service.get_options_chain", return_value=MOCK_EMPTY)

    response = client.get("/api/options/ZZZZZ", headers=auth_headers)

    assert response.status_code == 404
    assert "No options found" in response.json()["detail"]


def test_options_returns_502_on_generic_error(client: TestClient, auth_headers, mocker):
    mocker.patch(
        "services.options_service.get_options_chain",
        side_effect=Exception("API down"),
    )

    response = client.get("/api/options/AAPL", headers=auth_headers)

    assert response.status_code == 502


def test_options_returns_429_on_rate_limit(client: TestClient, auth_headers, mocker):
    mocker.patch(
        "services.options_service.get_options_chain",
        side_effect=OptionsRateLimitError("Massive rate limit exceeded"),
    )

    response = client.get("/api/options/AAPL", headers=auth_headers)

    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"].lower()


def test_options_returns_403_without_token(client: TestClient):
    response = client.get("/api/options/AAPL")

    assert response.status_code == 403


def test_options_rejects_invalid_symbol(client: TestClient, auth_headers):
    response = client.get("/api/options/AAPL123!", headers=auth_headers)

    assert response.status_code == 422


def test_options_passes_strike_price_to_service(
    client: TestClient, auth_headers, mocker
):
    spy = mocker.patch(
        "services.options_service.get_options_chain", return_value=MOCK_OPTIONS
    )

    client.get("/api/options/AAPL?strike_price=270", headers=auth_headers)

    spy.assert_called_once_with("AAPL", strike_price=270.0)
