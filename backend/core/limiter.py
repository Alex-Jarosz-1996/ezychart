from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _real_ip(request: Request) -> str:
    return request.headers.get("X-Real-IP") or get_remote_address(request)


limiter = Limiter(key_func=_real_ip)
