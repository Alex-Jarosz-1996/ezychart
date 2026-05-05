import os

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

_FMP_API_KEY = os.getenv("FMP_API_KEY", "")
_STOCKDATA_API_KEY = os.getenv("STOCKDATA_API_KEY", "")

_FMP_EOD_URL = "https://financialmodelingprep.com/stable/historical-price-eod/light"
_STOCKDATA_INTRADAY_URL = "https://api.stockdata.org/v1/data/intraday"

_RANGE_TO_DAYS = {
    "1w": 7,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
    "2y": 730,
    "max": None,
}


def get_eod(symbol: str, rng: str = "1y") -> dict:
    """Fetch EOD data from FMP and return the most recent N trading days."""
    params = {"symbol": symbol.upper(), "apikey": _FMP_API_KEY}

    try:
        resp = httpx.get(_FMP_EOD_URL, params=params, timeout=10)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="FMP API unreachable") from exc

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502, detail=f"FMP API returned {resp.status_code}"
        )

    payload = resp.json()
    if not isinstance(payload, list) or len(payload) == 0:
        raise HTTPException(
            status_code=404, detail=f"No EOD data for symbol '{symbol.upper()}'"
        )

    # FMP returns newest-first; normalise then slice to requested range
    data = [
        {
            "date": row["date"],
            "price": float(row.get("price", 0)),
            "volume": int(row.get("volume", 0)),
        }
        for row in payload
        if "date" in row
    ]

    days = _RANGE_TO_DAYS.get(rng, 365)
    if days is not None:
        data = data[:days]

    data.sort(key=lambda r: r["date"])
    return {"symbol": symbol.upper(), "range": rng, "data": data}


def get_intraday(symbol: str, interval: str = "5min") -> dict:
    """Fetch intraday OHLCV data from StockData and normalise to a flat list."""
    params = {
        "symbols": symbol.upper(),
        "api_token": _STOCKDATA_API_KEY,
        "interval": interval,
    }

    try:
        resp = httpx.get(_STOCKDATA_INTRADAY_URL, params=params, timeout=10)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503, detail="StockData API unreachable"
        ) from exc

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502, detail=f"StockData API returned {resp.status_code}"
        )

    payload = resp.json()
    # StockData returns {"data": [{"ticker": ..., "date": ..., "open": ..., ...}]}
    rows = payload.get("data", [])
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"No intraday data for symbol '{symbol.upper()}'"
        )

    data = [
        {
            "date": row["date"],
            "open": float(row.get("open", 0)),
            "high": float(row.get("high", 0)),
            "low": float(row.get("low", 0)),
            "close": float(row.get("close", 0)),
            "volume": int(row.get("volume", 0)),
        }
        for row in rows
        if row.get("ticker", "").upper() == symbol.upper() and "date" in row
    ]
    data.sort(key=lambda r: r["date"])
    return {"symbol": symbol.upper(), "interval": interval, "data": data}
