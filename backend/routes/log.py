import logging
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from core.limiter import limiter

logger = logging.getLogger("frontend")
router = APIRouter(prefix="/api")

_LEVEL_MAP = {"info": logging.INFO, "warn": logging.WARNING, "error": logging.ERROR}


class _LogEntry(BaseModel):
    level: Literal["info", "warn", "error"] = "info"
    message: str = Field(..., max_length=500)
    context: dict[str, Any] = {}


@router.post("/log", status_code=204)
@limiter.limit("60/minute")
async def receive_log(request: Request, body: _LogEntry):
    """Accept structured log events from the frontend."""
    logger.log(
        _LEVEL_MAP[body.level],
        body.message,
        extra={"source": "frontend", **body.context},
    )
