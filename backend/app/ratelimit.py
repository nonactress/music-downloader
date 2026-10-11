"""IP당 요청 수 제한 (PLAN 12장) → 429 RATE_LIMITED."""
from fastapi import Request

from . import config, store
from .errors import ApiError


def limit_per_ip(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    if store.hit_rate_limit(request.url.path, ip, config.RATE_LIMIT_PER_MINUTE):
        raise ApiError("RATE_LIMITED")
