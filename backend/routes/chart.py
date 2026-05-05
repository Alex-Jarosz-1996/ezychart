import logging

from fastapi import APIRouter, Depends, Path, Query, Request

from core.dependencies import get_current_user
from core.limiter import limiter
from models.chart import EODResponse, IntradayResponse
from services import chart_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_VALID_RANGES = {"1w", "1m", "3m", "6m", "1y", "2y", "max"}
_VALID_INTERVALS = {"1min", "5min", "15min", "30min", "1hour"}


@router.get("/chart/eod/{symbol}", response_model=EODResponse)
@limiter.limit("30/minute")
def get_eod_chart(
    request: Request,
    symbol: str = Path(..., pattern=r"^[A-Za-z.]{1,10}$"),
    rng: str = Query(default="1y"),
    _=Depends(get_current_user),
):
    if rng not in _VALID_RANGES:
        rng = "1y"
    result = chart_service.get_eod(symbol, rng)
    return EODResponse(**result)


@router.get("/chart/intraday/{symbol}", response_model=IntradayResponse)
@limiter.limit("30/minute")
def get_intraday_chart(
    request: Request,
    symbol: str = Path(..., pattern=r"^[A-Za-z.]{1,10}$"),
    interval: str = Query(default="5min"),
    _=Depends(get_current_user),
):
    if interval not in _VALID_INTERVALS:
        interval = "5min"
    result = chart_service.get_intraday(symbol, interval)
    return IntradayResponse(**result)
