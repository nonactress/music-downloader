"""FastAPI 앱 (PLAN 8장, CONTRACT 2장 · 5장)."""
from fastapi import Depends, FastAPI, Request

from . import config, errors, sessions
from .routers import auth, exports, jobs, tracks


async def refresh_session_cookie(request: Request, call_next):
    """세션을 쓴 요청이면 쿠키 Max-Age도 30일로 다시 (하루에 한 번). 파일 응답(오디오 · 다운로드)도 포함."""
    response = await call_next(request)
    token = getattr(request.state, "refresh_session_cookie", None)
    already = any(k.lower() == "set-cookie" and sessions.COOKIE_NAME in v
                  for k, v in response.headers.items())
    if token and not already:
        auth.set_session_cookie(response, token)
    return response


def health() -> dict:
    return {"ok": True}


def create_app(api_docs: bool | None = None) -> FastAPI:
    """api_docs: API 자동 문서를 켤지. 없으면 API_DOCS 환경 변수 (기본 끔, 결정 62)."""
    docs = config.API_DOCS if api_docs is None else api_docs
    app = FastAPI(
        title="쉬운 음악 만들기 API",
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    errors.install(app)
    app.include_router(auth.router)
    # /health · /auth/login · /auth/logout 말고는 모두 로그인 필요 (결정 57). 라우터 단위로 걸어서 빠뜨릴 수 없게
    login_required = [Depends(auth.current_user)]
    app.include_router(tracks.router, dependencies=login_required)
    app.include_router(jobs.router, dependencies=login_required)
    app.include_router(exports.router, dependencies=login_required)
    app.middleware("http")(refresh_session_cookie)
    app.get("/health")(health)
    return app


app = create_app()
