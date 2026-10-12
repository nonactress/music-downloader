"""POST /auth/login · POST /auth/logout · GET /auth/me (CONTRACT 5장)."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from .. import accounts, config, sessions
from ..errors import ApiError
from ..ratelimit import client_ip

router = APIRouter()


class LoginRequest(BaseModel):
    loginId: str = Field(max_length=200)
    password: str = Field(max_length=accounts.MAX_PASSWORD_LENGTH)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        sessions.COOKIE_NAME, token,
        max_age=config.SESSION_TTL_SEC, path="/",
        httponly=True, samesite="lax", secure=config.COOKIE_SECURE,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        sessions.COOKIE_NAME, path="/",
        httponly=True, samesite="lax", secure=config.COOKIE_SECURE,
    )


DESKTOP_USER = "me"


def current_user(request: Request) -> str:
    """로그인한 사람의 아이디. 아니면 401 UNAUTHORIZED (결정 57).
    데스크톱: /desktop/start에서 받은 이번 실행의 세션 쿠키가 있으면 "me" (CONTRACT 7-1)."""
    if config.DESKTOP:
        from .desktop import has_desktop_session
        if not has_desktop_session(request):
            raise ApiError("UNAUTHORIZED")
        request.state.login_id = DESKTOP_USER
        return DESKTOP_USER
    found = sessions.lookup(request.cookies.get(sessions.COOKIE_NAME))
    if found is None:
        raise ApiError("UNAUTHORIZED")
    login_id, refresh_cookie = found
    if not accounts.user_exists(login_id):  # 계정 파일에서 직접 지운 경우까지
        sessions.delete(request.cookies.get(sessions.COOKIE_NAME))
        raise ApiError("UNAUTHORIZED")
    if refresh_cookie:
        # 30일 유지를 쿠키에도 반영 — main.py 미들웨어가 응답에 Set-Cookie를 붙인다
        request.state.refresh_session_cookie = request.cookies.get(sessions.COOKIE_NAME)
    request.state.login_id = login_id
    return login_id


@router.post("/auth/login")
def login(body: LoginRequest, request: Request, response: Response) -> dict:
    login_id = accounts.normalize_login_id(body.loginId)
    ip = client_ip(request)
    if sessions.is_locked(login_id, ip):
        raise ApiError("LOGIN_LOCKED")
    if accounts.verify(login_id, body.password) is None:
        sessions.record_failure(login_id, ip)
        raise ApiError("LOGIN_FAILED")
    sessions.clear_failures(login_id)
    sessions.delete(request.cookies.get(sessions.COOKIE_NAME))  # 예전 세션은 버리고 새로
    set_session_cookie(response, sessions.create(login_id))
    return {"user": {"loginId": login_id}}


@router.post("/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    sessions.delete(request.cookies.get(sessions.COOKIE_NAME))
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response


@router.get("/auth/me")
def me(login_id: str = Depends(current_user)) -> dict:
    """CONTRACT 5-4 · 7-2: desktop 필드로 프론트가 로그인 화면을 보일지 정한다."""
    return {"user": {"loginId": login_id}, "desktop": config.DESKTOP}


# 데스크톱에서는 /auth/me만 쓴다 (/auth/login · /auth/logout은 404, CONTRACT 7-1)
desktop_router = APIRouter()
desktop_router.add_api_route("/auth/me", me, methods=["GET"])
