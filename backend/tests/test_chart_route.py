from fastapi.testclient import TestClient

from tests.conftest import (
    MOCK_FMP_EOD,
    MOCK_FMP_EOD_FULL,
    MOCK_INTRADAY_NORMALISED,
)

# --- GET /api/chart/eod/{symbol} ---


def test_get_eod_chart_returns_200_with_correct_shape(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.chart_service.get_eod",
        return_value={"symbol": "AAPL", "range": "1y", "data": MOCK_FMP_EOD},
    )

    response = client.get("/api/chart/eod/AAPL", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["range"] == "1y"
    assert isinstance(body["data"], list)
    assert body["data"][0]["price"] == 189.0


def test_get_eod_chart_returns_401_without_token(client: TestClient):
    response = client.get("/api/chart/eod/AAPL")

    assert response.status_code == 401


def test_get_eod_chart_invalid_range_falls_back_to_1y(
    client: TestClient, auth_headers, mocker
):
    spy = mocker.patch(
        "services.chart_service.get_eod",
        return_value={"symbol": "AAPL", "range": "1y", "data": MOCK_FMP_EOD},
    )

    client.get("/api/chart/eod/AAPL?rng=bad_range", headers=auth_headers)

    spy.assert_called_once_with("AAPL", "1y")


def test_get_eod_chart_valid_range_is_passed_through(
    client: TestClient, auth_headers, mocker
):
    spy = mocker.patch(
        "services.chart_service.get_eod",
        return_value={"symbol": "AAPL", "range": "3m", "data": MOCK_FMP_EOD},
    )

    client.get("/api/chart/eod/AAPL?rng=3m", headers=auth_headers)

    spy.assert_called_once_with("AAPL", "3m")


def test_get_eod_chart_rejects_invalid_symbol(client: TestClient, auth_headers):
    response = client.get("/api/chart/eod/AAPL123", headers=auth_headers)

    assert response.status_code == 422


def test_get_eod_chart_bubbles_up_404(client: TestClient, auth_headers, mocker):
    from fastapi import HTTPException

    mocker.patch(
        "services.chart_service.get_eod",
        side_effect=HTTPException(status_code=404, detail="No EOD data"),
    )

    response = client.get("/api/chart/eod/ZZZZZ", headers=auth_headers)

    assert response.status_code == 404


def test_get_eod_chart_bubbles_up_502(client: TestClient, auth_headers, mocker):
    from fastapi import HTTPException

    mocker.patch(
        "services.chart_service.get_eod",
        side_effect=HTTPException(status_code=502, detail="FMP error"),
    )

    response = client.get("/api/chart/eod/AAPL", headers=auth_headers)

    assert response.status_code == 502


def test_get_eod_chart_bubbles_up_503(client: TestClient, auth_headers, mocker):
    from fastapi import HTTPException

    mocker.patch(
        "services.chart_service.get_eod",
        side_effect=HTTPException(status_code=503, detail="FMP unreachable"),
    )

    response = client.get("/api/chart/eod/AAPL", headers=auth_headers)

    assert response.status_code == 503


# --- GET /api/chart/eod-candle/{symbol} ---


def test_get_eod_candle_chart_returns_200_with_correct_shape(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.chart_service.get_eod_candle",
        return_value={"symbol": "AAPL", "range": "1y", "data": MOCK_FMP_EOD_FULL},
    )

    response = client.get("/api/chart/eod-candle/AAPL", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["range"] == "1y"
    assert isinstance(body["data"], list)
    assert body["data"][0]["open"] == 187.15
    assert body["data"][0]["close"] == 185.92


def test_get_eod_candle_chart_returns_401_without_token(client: TestClient):
    response = client.get("/api/chart/eod-candle/AAPL")

    assert response.status_code == 401


def test_get_eod_candle_chart_invalid_range_falls_back_to_1y(
    client: TestClient, auth_headers, mocker
):
    spy = mocker.patch(
        "services.chart_service.get_eod_candle",
        return_value={"symbol": "AAPL", "range": "1y", "data": MOCK_FMP_EOD_FULL},
    )

    client.get("/api/chart/eod-candle/AAPL?rng=bad_range", headers=auth_headers)

    spy.assert_called_once_with("AAPL", "1y")


def test_get_eod_candle_chart_bubbles_up_404(client: TestClient, auth_headers, mocker):
    from fastapi import HTTPException

    mocker.patch(
        "services.chart_service.get_eod_candle",
        side_effect=HTTPException(status_code=404, detail="No data"),
    )

    response = client.get("/api/chart/eod-candle/ZZZZZ", headers=auth_headers)

    assert response.status_code == 404


# --- GET /api/chart/intraday/{symbol} ---


def test_get_intraday_chart_returns_200_with_correct_shape(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.chart_service.get_intraday",
        return_value={
            "symbol": "AAPL",
            "interval": "minute",
            "data": MOCK_INTRADAY_NORMALISED,
        },
    )

    response = client.get("/api/chart/intraday/AAPL", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "AAPL"
    assert body["interval"] == "minute"
    assert isinstance(body["data"], list)


def test_get_intraday_chart_returns_401_without_token(client: TestClient):
    response = client.get("/api/chart/intraday/AAPL")

    assert response.status_code == 401


def test_get_intraday_chart_invalid_interval_falls_back_to_minute(
    client: TestClient, auth_headers, mocker
):
    spy = mocker.patch(
        "services.chart_service.get_intraday",
        return_value={
            "symbol": "AAPL",
            "interval": "minute",
            "data": MOCK_INTRADAY_NORMALISED,
        },
    )

    client.get("/api/chart/intraday/AAPL?interval=bad_interval", headers=auth_headers)

    spy.assert_called_once_with("AAPL", "minute")


def test_get_intraday_chart_hour_interval_is_passed_through(
    client: TestClient, auth_headers, mocker
):
    spy = mocker.patch(
        "services.chart_service.get_intraday",
        return_value={
            "symbol": "AAPL",
            "interval": "hour",
            "data": MOCK_INTRADAY_NORMALISED,
        },
    )

    client.get("/api/chart/intraday/AAPL?interval=hour", headers=auth_headers)

    spy.assert_called_once_with("AAPL", "hour")
