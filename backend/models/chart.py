from pydantic import BaseModel


class EODPoint(BaseModel):
    date: str
    price: float
    volume: int


class OHLCVPoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class EODResponse(BaseModel):
    symbol: str
    range: str
    data: list[EODPoint]


class IntradayResponse(BaseModel):
    symbol: str
    interval: str
    data: list[OHLCVPoint]
