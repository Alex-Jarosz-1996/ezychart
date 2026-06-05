import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.limiter import limiter
from middleware.cors import register_cors
from routes.ai import router as ai_router
from routes.auth import router as auth_router
from routes.chart import router as chart_router
from routes.financials import router as financials_router
from routes.mcp import router as mcp_router
from routes.options import router as options_router
from routes.quote import router as quote_router
from services import mcp_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await mcp_service._get_client()
        logger.info("MCP client pre-warmed successfully")
    except Exception:
        logger.warning("MCP pre-warm failed — will retry on first request")
    yield


app = FastAPI(title="Finnhub Dashboard API", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

register_cors(app)
app.include_router(auth_router)
app.include_router(quote_router)
app.include_router(financials_router)
app.include_router(chart_router)
app.include_router(options_router)
app.include_router(mcp_router)
app.include_router(ai_router)


@app.get("/health", status_code=status.HTTP_200_OK)
def health() -> dict:
    return {"status": "ok"}
