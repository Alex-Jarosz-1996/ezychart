import os
from datetime import datetime, timedelta, timezone

# Must be set before main/finnhub_service are imported
os.environ.setdefault("FINNHUB_API_KEY", "test_key")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret")
os.environ.setdefault("APP_PASSWORD", "test_password")
os.environ.setdefault("FMP_API_KEY", "test_fmp_key")
os.environ.setdefault("STOCKDATA_API_KEY", "test_stockdata_key")

import jwt
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers():
    payload = {"exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


# --- Shared mock payloads ---

MOCK_QUOTE = {"c": 189.50, "h": 191.00, "l": 187.30, "o": 188.00, "pc": 187.50}

MOCK_BASIC_FINANCIALS = {
    "metric": {
        "52WeekHigh": 199.62,
        "52WeekLow": 164.08,
        "marketCapitalization": 2950000.0,
        "currentDividendYieldTTM": 0.55,
        "dividendPerShareTTM": 0.96,
        "epsGrowthTTMYoy": 12.3,
        "grossMarginTTM": 45.96,
        "netProfitMarginTTM": 26.44,
        "operatingMarginTTM": 31.51,
        "pretaxMarginTTM": 31.7,
        "enterpriseValue": 2900000.0,
        "currentEv/freeCashFlowTTM": 28.1,
        "ebitdPerShareTTM": 8.5,
        "bookValuePerShareAnnual": 4.8,
        "cashPerSharePerShareAnnual": 3.1,
        "cashFlowPerShareAnnual": 7.2,
        "pcfShareTTM": 24.1,
        "pfcfShareTTM": 26.3,
    },
    "series": {
        "quarterly": {
            "peTTM": [{"v": 28.4, "period": "2024-09-28"}],
            "psTTM": [{"v": 7.1, "period": "2024-09-28"}],
            "pb": [{"v": 45.2, "period": "2024-09-28"}],
            "eps": [{"v": 6.57, "period": "2024-09-28"}],
            "roaTTM": [{"v": 0.28, "period": "2024-09-28"}],
            "roeTTM": [{"v": 1.47, "period": "2024-09-28"}],
            "roicTTM": [{"v": 0.55, "period": "2024-09-28"}],
            "rotcTTM": [{"v": 0.61, "period": "2024-09-28"}],
            "currentRatio": [{"v": 0.99, "period": "2024-09-28"}],
            "quickRatio": [{"v": 0.95, "period": "2024-09-28"}],
            "totalDebtToEquity": [{"v": 1.8, "period": "2024-09-28"}],
            "totalDebtToTotalAsset": [{"v": 0.32, "period": "2024-09-28"}],
            "totalDebtToTotalCapital": [{"v": 0.64, "period": "2024-09-28"}],
            "bookValue": [{"v": 3.95, "period": "2024-09-28"}],
            "ebitPerShare": [{"v": 7.1, "period": "2024-09-28"}],
            "evEbitdaTTM": [{"v": 22.3, "period": "2024-09-28"}],
            "evRevenueTTM": [{"v": 7.8, "period": "2024-09-28"}],
            "fcfPerShareTTM": [{"v": 6.4, "period": "2024-09-28"}],
            "pfcfTTM": [{"v": 25.1, "period": "2024-09-28"}],
        }
    },
}

MOCK_FINANCIALS_REPORTED = {
    "data": [
        {
            "report": {
                "bs": [
                    {
                        "label": "Total Assets",
                        "concept": "Assets",
                        "value": 364980000000,
                    }
                ],
                "ic": [
                    {
                        "label": "Gross Profit",
                        "concept": "GrossProfit",
                        "value": 180683000000,
                    }
                ],
                "cf": [
                    {
                        "label": "Net Income",
                        "concept": "NetIncomeLoss",
                        "value": 93736000000,
                    }
                ],
            }
        }
    ]
}

MOCK_FMP_EOD = [
    {"symbol": "AAPL", "date": "2024-01-03", "price": 189.0, "volume": 48000000},
    {"symbol": "AAPL", "date": "2024-01-02", "price": 187.0, "volume": 50000000},
]

MOCK_STOCKDATA_INTRADAY = {
    "data": [
        {
            "ticker": "AAPL",
            "date": "2024-01-03T10:00:00",
            "open": 187.0,
            "high": 188.5,
            "low": 186.5,
            "close": 188.0,
            "volume": 1200000,
        },
        {
            "ticker": "AAPL",
            "date": "2024-01-03T10:05:00",
            "open": 188.0,
            "high": 189.0,
            "low": 187.5,
            "close": 188.5,
            "volume": 900000,
        },
    ]
}
