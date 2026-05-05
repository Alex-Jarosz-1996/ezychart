import httpx
import pytest

from services import chart_service
from tests.conftest import MOCK_FMP_EOD, MOCK_STOCKDATA_INTRADAY

# --- get_eod ---


def test_get_eod_normalises_response(respx_mock):
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json=MOCK_FMP_EOD)
    )

    result = chart_service.get_eod("aapl", "1y")

    assert result["symbol"] == "AAPL"
    assert result["range"] == "1y"
    # service sorts ascending; oldest entry is first
    assert result["data"][0]["date"] == "2024-01-02"
    assert result["data"][0]["price"] == 187.0
    assert result["data"][0]["volume"] == 50000000


def test_get_eod_returns_chronological_order(respx_mock):
    # service should sort ascending regardless of FMP input order
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json=MOCK_FMP_EOD)
    )

    result = chart_service.get_eod("AAPL")

    dates = [row["date"] for row in result["data"]]
    assert dates == sorted(dates)


def test_get_eod_slices_to_requested_range(respx_mock):
    # FMP newest-first: day 10 is most recent, day 1 is oldest
    # Requesting "1w" (7) takes the first 7 entries = days 10 down to 4
    many_days = [
        {
            "symbol": "AAPL",
            "date": f"2024-01-{i:02d}",
            "price": 150.0 + i,
            "volume": 1000000,
        }
        for i in range(10, 0, -1)
    ]
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json=many_days)
    )

    result = chart_service.get_eod("AAPL", "1w")

    assert len(result["data"]) == 7
    assert result["data"][0]["date"] == "2024-01-04"
    assert result["data"][-1]["date"] == "2024-01-10"


def test_get_eod_max_range_returns_all_data(respx_mock):
    many_days = [
        {
            "symbol": "AAPL",
            "date": f"2024-01-{i:02d}",
            "price": 150.0,
            "volume": 1000000,
        }
        for i in range(10, 0, -1)
    ]
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json=many_days)
    )

    result = chart_service.get_eod("AAPL", "max")

    assert len(result["data"]) == 10


def test_get_eod_passthrough_price_and_volume(respx_mock):
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "symbol": "AAPL",
                    "date": "2021-08-24",
                    "price": 149.62,
                    "volume": 48606428,
                }
            ],
        )
    )

    result = chart_service.get_eod("AAPL")

    assert result["data"][0]["price"] == 149.62
    assert result["data"][0]["volume"] == 48606428
    assert "open" not in result["data"][0]
    assert "close" not in result["data"][0]


def test_get_eod_uppercases_symbol(respx_mock):
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json=MOCK_FMP_EOD)
    )

    result = chart_service.get_eod("aapl")

    assert result["symbol"] == "AAPL"


def test_get_eod_filters_rows_missing_date(respx_mock):
    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "symbol": "AAPL",
                    "date": "2024-01-03",
                    "price": 189.0,
                    "volume": 1000000,
                },
                {"symbol": "AAPL", "price": 188.0, "volume": 900000},  # no date key
            ],
        )
    )

    result = chart_service.get_eod("AAPL")

    assert len(result["data"]) == 1
    assert result["data"][0]["date"] == "2024-01-03"


def test_get_eod_raises_404_on_non_list_response(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json={"error": "unknown symbol"})
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_eod("AAPL")

    assert exc_info.value.status_code == 404


def test_get_eod_raises_404_on_empty_response(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(200, json=[])
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_eod("ZZZZZ")

    assert exc_info.value.status_code == 404


def test_get_eod_raises_502_on_upstream_error(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        return_value=httpx.Response(500, json={"error": "internal"})
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_eod("AAPL")

    assert exc_info.value.status_code == 502


def test_get_eod_raises_503_on_network_error(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._FMP_EOD_URL).mock(
        side_effect=httpx.ConnectError("unreachable")
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_eod("AAPL")

    assert exc_info.value.status_code == 503


# --- get_intraday ---


def test_get_intraday_normalises_response(respx_mock):
    respx_mock.get(chart_service._STOCKDATA_INTRADAY_URL).mock(
        return_value=httpx.Response(200, json=MOCK_STOCKDATA_INTRADAY)
    )

    result = chart_service.get_intraday("aapl", "5min")

    assert result["symbol"] == "AAPL"
    assert result["interval"] == "5min"
    assert len(result["data"]) == 2
    assert result["data"][0]["date"] == "2024-01-03T10:00:00"
    assert result["data"][0]["close"] == 188.0


def test_get_intraday_uppercases_symbol(respx_mock):
    respx_mock.get(chart_service._STOCKDATA_INTRADAY_URL).mock(
        return_value=httpx.Response(200, json=MOCK_STOCKDATA_INTRADAY)
    )

    result = chart_service.get_intraday("aapl")

    assert result["symbol"] == "AAPL"


def test_get_intraday_filters_to_requested_symbol(respx_mock):
    mixed = {
        "data": [
            *MOCK_STOCKDATA_INTRADAY["data"],
            {
                "ticker": "MSFT",
                "date": "2024-01-03T10:00:00",
                "open": 375.0,
                "high": 376.0,
                "low": 374.0,
                "close": 375.5,
                "volume": 500000,
            },
        ]
    }
    respx_mock.get(chart_service._STOCKDATA_INTRADAY_URL).mock(
        return_value=httpx.Response(200, json=mixed)
    )

    result = chart_service.get_intraday("AAPL")

    assert all(row["close"] != 375.5 for row in result["data"])
    assert len(result["data"]) == 2


def test_get_intraday_raises_404_on_empty_response(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._STOCKDATA_INTRADAY_URL).mock(
        return_value=httpx.Response(200, json={"data": []})
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_intraday("ZZZZZ")

    assert exc_info.value.status_code == 404


def test_get_intraday_raises_502_on_upstream_error(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._STOCKDATA_INTRADAY_URL).mock(
        return_value=httpx.Response(401, json={"error": "unauthorized"})
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_intraday("AAPL")

    assert exc_info.value.status_code == 502


def test_get_intraday_raises_503_on_network_error(respx_mock):
    from fastapi import HTTPException

    respx_mock.get(chart_service._STOCKDATA_INTRADAY_URL).mock(
        side_effect=httpx.ConnectError("unreachable")
    )

    with pytest.raises(HTTPException) as exc_info:
        chart_service.get_intraday("AAPL")

    assert exc_info.value.status_code == 503
