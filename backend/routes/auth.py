import hmac
import logging
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, Request

from core.limiter import limiter
from models.auth import LoginRequest, TokenResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest):
    if not hmac.compare_digest(body.password, os.environ.get("APP_PASSWORD", "")):
        logger.warning(
            "Failed login attempt from %s",
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=401, detail="Invalid password")

    payload = {"exp": datetime.now(timezone.utc) + timedelta(hours=24)}
    token = jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
    logger.info(
        "Successful login from %s", request.client.host if request.client else "unknown"
    )
    return TokenResponse(access_token=token)
