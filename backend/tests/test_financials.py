from fastapi.testclient import TestClient

from tests.conftest import MOCK_BASIC_FINANCIALS, MOCK_FINANCIALS_REPORTED


def _mock_financials(mocker):
    mocker.patch(
        "services.finnhub_service.get_basic_financials",
        return_value=MOCK_BASIC_FINANCIALS,
    )
    mocker.patch(
        "services.finnhub_service.get_financials_reported",
        return_value=MOCK_FINANCIALS_REPORTED,
    )


def test_financials_returns_200_with_correct_shape(
    client: TestClient, auth_headers, mocker
):
    _mock_financials(mocker)

    response = client.get("/api/financials/AAPL", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "AAPL"
    assert "metrics" in data
    assert "reported" in data


def test_financials_symbol_is_uppercased(client: TestClient, auth_headers, mocker):
    _mock_financials(mocker)

    response = client.get("/api/financials/aapl", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["symbol"] == "AAPL"


def test_financials_metrics_contain_all_groups(
    client: TestClient, auth_headers, mocker
):
    _mock_financials(mocker)

    response = client.get("/api/financials/AAPL", headers=auth_headers)
    metrics = response.json()["metrics"]

    for group in (
        "valuation",
        "returns",
        "margins",
        "ratios",
        "debt",
        "equity",
        "ev",
        "cashFlow",
    ):
        assert group in metrics, f"Missing metrics group: {group}"


def test_financials_series_fields_include_as_of_date(
    client: TestClient, auth_headers, mocker
):
    _mock_financials(mocker)

    response = client.get("/api/financials/AAPL", headers=auth_headers)
    pe = response.json()["metrics"]["valuation"]["peTTM"]

    assert pe["value"] == 28.4
    assert pe["asOf"] == "2024-09-28"


def test_financials_reported_contains_all_statements(
    client: TestClient, auth_headers, mocker
):
    _mock_financials(mocker)

    response = client.get("/api/financials/AAPL", headers=auth_headers)
    reported = response.json()["reported"]

    assert "balanceSheet" in reported
    assert "incomeStatement" in reported
    assert "cashFlowStatement" in reported
    assert reported["balanceSheet"][0]["label"] == "Total Assets"


def test_financials_returns_404_when_all_metrics_none(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.finnhub_service.get_basic_financials",
        return_value={"metric": {}, "series": {"quarterly": {}}},
    )
    mocker.patch(
        "services.finnhub_service.get_financials_reported", return_value={"data": []}
    )

    response = client.get("/api/financials/ZZZZZ", headers=auth_headers)

    assert response.status_code == 404
    assert "ZZZZZ" in response.json()["detail"]


def test_financials_returns_502_on_finnhub_error(
    client: TestClient, auth_headers, mocker
):
    mocker.patch(
        "services.finnhub_service.get_basic_financials",
        side_effect=Exception("API unavailable"),
    )

    response = client.get("/api/financials/AAPL", headers=auth_headers)

    assert response.status_code == 502


def test_financials_returns_429_on_rate_limit(client: TestClient, auth_headers, mocker):
    from services.finnhub_service import FinnhubRateLimitError

    mocker.patch(
        "services.finnhub_service.build_metrics",
        side_effect=FinnhubRateLimitError("rate limited"),
    )

    response = client.get("/api/financials/AAPL", headers=auth_headers)

    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"].lower()


def test_financials_returns_401_without_token(client: TestClient):
    response = client.get("/api/financials/AAPL")

    assert response.status_code == 401
