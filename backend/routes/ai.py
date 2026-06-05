import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from core.dependencies import get_current_user
from core.limiter import limiter
from models.ai import ChatRequest
from services import ai_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.post("/chat")
@limiter.limit("10/minute")
async def post_chat(
    request: Request,
    body: ChatRequest,
    _=Depends(get_current_user),
):
    history = [{"role": m.role, "content": m.content} for m in body.history]

    async def event_stream():
        try:
            async for chunk in ai_service.chat_stream(body.message, history):
                yield f"data: {json.dumps({'token': chunk})}\n\n"
        except Exception:
            logger.exception("AI chat stream error")
            yield f"data: {json.dumps({'error': 'AI service error'})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
