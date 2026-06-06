import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from core.limiter import limiter
from middleware.cors import register_cors
from routes.ai import router as ai_router
from routes.auth import router as auth_router
from routes.chart import router as chart_router
from routes.financials import router as financials_router
from routes.log import router as log_router
from routes.mcp import router as mcp_router
from routes.options import router as options_router
from routes.quote import router as quote_router
from services import mcp_service


class _JsonFormatter(logging.Formatter):
    _SKIP = frozenset({
        "name", "msg", "args", "levelname", "levelno", "pathname",
        "filename", "module", "exc_info", "exc_text", "stack_info",
        "lineno", "funcName", "created", "msecs", "relativeCreated",
        "thread", "threadName", "processName", "process", "taskName",
        "message",
    })

    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        entry.update({k: v for k, v in record.__dict__.items() if k not in self._SKIP})
        return json.dumps(entry)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


_configure_logging()
logger = logging.getLogger(__name__)
_access = logging.getLogger("access")

_NO_LOG_PATHS = {"/health"}


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    response = JSONResponse({"detail": f"Rate limit exceeded: {exc.detail}"}, status_code=429)
    response.headers["Retry-After"] = "60"
    return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await mcp_service._get_client()
        logger.info("MCP client pre-warmed successfully")
    except Exception:
        logger.warning("MCP pre-warm failed — will retry on first request")
    yield


app = FastAPI(title="EzyChart API", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


@app.middleware("http")
async def _log_requests(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    t0 = time.perf_counter()
    response = await call_next(request)
    if request.url.path not in _NO_LOG_PATHS:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        _access.info(
            "http",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "ms": ms,
                "ip": request.headers.get("X-Real-IP")
                    or getattr(request.client, "host", "-"),
            },
        )
    response.headers["X-Request-ID"] = request_id
    return response


register_cors(app)
app.include_router(auth_router)
app.include_router(quote_router)
app.include_router(financials_router)
app.include_router(chart_router)
app.include_router(options_router)
app.include_router(mcp_router)
app.include_router(ai_router)
app.include_router(log_router)


@app.get("/health", status_code=status.HTTP_200_OK)
def health() -> dict:
    return {"status": "ok"}
