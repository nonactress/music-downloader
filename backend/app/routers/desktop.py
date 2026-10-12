"""데스크톱 모드 전용 (CONTRACT 7장, 결정 69).

- `GET /desktop/start?key=<실행 열쇠>`: 실행기가 창을 이 주소로 연다 → 세션 쿠키(SameSite=Strict) + 302 /
- 이번 실행의 세션 토큰은 프로세스 메모리에만 있다 (껐다 켜면 새로)
- Host가 127.0.0.1:<포트>가 아니면 403 — 같은 컴퓨터의 다른 웹사이트(DNS 리바인딩 · CSRF)를 막음
"""
from __future__ import annotations

import hmac
import secrets

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .. import config, sessions
from ..error_codes import error_body

router = APIRouter()

_SESSION_TOKEN = secrets.token_urlsafe(32)


def has_desktop_session(request: Request) -> bool:
    cookie = request.cookies.get(sessions.COOKIE_NAME) or ""
    return hmac.compare_digest(cookie.encode(), _SESSION_TOKEN.encode())


def expected_host() -> str:
    return f"127.0.0.1:{config.DESKTOP_PORT}"


def forbidden() -> JSONResponse:
    return JSONResponse({"error": error_body("UNAUTHORIZED")}, status_code=403)


async def check_host(request: Request, call_next):
    """모든 요청(화면 파일 포함)에 Host 검사 (CONTRACT 7-1)."""
    if request.headers.get("host", "") != expected_host():
        return forbidden()
    return await call_next(request)


@router.get("/desktop/start")
def start(key: str = "") -> object:
    if not config.DESKTOP_KEY or not hmac.compare_digest(key.encode(), config.DESKTOP_KEY.encode()):
        return forbidden()
    response = RedirectResponse("/", status_code=302)
    response.set_cookie(sessions.COOKIE_NAME, _SESSION_TOKEN, path="/",
                        httponly=True, samesite="strict", secure=False)
    return response
