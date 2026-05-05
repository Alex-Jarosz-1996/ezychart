import logging

from fastapi import FastAPI, status
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.limiter import limiter
from middleware.cors import register_cors
from routes.auth import router as auth_router
from routes.chart import router as chart_router
from routes.financials import router as financials_router
from routes.quote import router as quote_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="Finnhub Dashboard API")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

register_cors(app)
app.include_router(auth_router)
app.include_router(quote_router)
app.include_router(financials_router)
app.include_router(chart_router)


@app.get("/health", status_code=status.HTTP_200_OK)
def health() -> dict:
    return {"status": "ok"}
