"""FastAPI 앱 (PLAN 8장, CONTRACT 2장 · 5장 · 7장).

서버 모드: API가 `/` 바로 아래 (nginx가 `/api/*`를 넘김).
데스크톱 모드(결정 65 · 66): 한 서버가 API를 `/api/*`로, 화면 파일(vite build)을 `/`로 제공.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse

from . import config, errors, sessions
from .errors import ApiError
from .routers import auth, exports, jobs, tracks
from .routers import desktop as desktop_routes


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


def _frontend_file(path: str) -> Path | None:
    """화면 파일. dist 밖으로 나가는 경로는 막고, 없는 경로는 index.html (한 페이지 앱)."""
    dist = config.FRONTEND_DIST.resolve()
    target = (dist / path).resolve()
    if path and target.is_file() and target.is_relative_to(dist):
        return target
    index = dist / "index.html"
    return index if index.is_file() else None


def _add_frontend(app: FastAPI) -> None:
    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                   include_in_schema=False)
    def unknown_api(rest: str) -> None:
        raise ApiError("NOT_FOUND")  # 없는 API(/api/auth/login 등)는 어떤 메서드든 404 JSON (CONTRACT 7-1)

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        file = _frontend_file(path)
        if file is None:
            raise ApiError("NOT_FOUND")
        # index.html은 새 버전이 바로 보이게 캐시하지 않음
        headers = {"Cache-Control": "no-cache"} if file.name == "index.html" else None
        return FileResponse(file, headers=headers)


@asynccontextmanager
async def _desktop_lifespan(app: FastAPI):
    """데스크톱: 켤 때 스레드 작업자 · 정리 시작, 끌 때 멈춤 (결정 66 · 67)."""
    from . import desktop_runtime
    desktop_runtime.start()
    try:
        yield
    finally:
        desktop_runtime.stop()


def create_app(api_docs: bool | None = None, desktop: bool | None = None) -> FastAPI:
    """api_docs: API 자동 문서(기본 API_DOCS, 결정 62). desktop: 데스크톱 모드(기본 DESKTOP, 결정 66)."""
    docs = config.API_DOCS if api_docs is None else api_docs
    is_desktop = config.DESKTOP if desktop is None else desktop
    prefix = "/api" if is_desktop else ""
    app = FastAPI(
        title="쉬운 음악 만들기 API",
        docs_url=f"{prefix}/docs" if docs else None,
        redoc_url=f"{prefix}/redoc" if docs else None,
        openapi_url=f"{prefix}/openapi.json" if docs else None,
        lifespan=_desktop_lifespan if is_desktop else None,
    )
    errors.install(app)
    # /health · /auth/login · /auth/logout(데스크톱은 /desktop/start) 말고는 모두 로그인 필요 (결정 57).
    # 라우터 단위로 걸어서 빠뜨릴 수 없게
    login_required = [Depends(auth.current_user)]
    if is_desktop:
        app.include_router(auth.desktop_router, prefix=prefix)
        app.include_router(desktop_routes.router)
    else:
        app.include_router(auth.router)
    app.include_router(tracks.router, prefix=prefix, dependencies=login_required)
    app.include_router(jobs.router, prefix=prefix, dependencies=login_required)
    app.include_router(exports.router, prefix=prefix, dependencies=login_required)
    if is_desktop:  # 저장 · 저장한 곳 열기 (CONTRACT 7-3 · 7-4) — 서버 모드에는 없음(404)
        app.include_router(desktop_routes.api_router, prefix=prefix, dependencies=login_required)
    app.get(f"{prefix}/health")(health)
    if is_desktop:
        app.middleware("http")(desktop_routes.check_host)
        _add_frontend(app)  # 맨 마지막: 위 경로가 먼저
    else:
        app.middleware("http")(refresh_session_cookie)
    return app


app = create_app()
