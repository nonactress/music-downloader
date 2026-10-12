"""FastAPI 앱 (PLAN 8장, CONTRACT 2장 · 5장)."""
from fastapi import FastAPI, Request

from . import errors, sessions
from .routers import auth, exports, jobs, tracks

app = FastAPI(title="쉬운 음악 만들기 API")
errors.install(app)
app.include_router(auth.router)
app.include_router(tracks.router)
app.include_router(jobs.router)
app.include_router(exports.router)


@app.middleware("http")
async def refresh_session_cookie(request: Request, call_next):
    """세션을 쓴 요청이면 쿠키 Max-Age도 30일로 다시 (하루에 한 번). 파일 응답(오디오 · 다운로드)도 포함."""
    response = await call_next(request)
    token = getattr(request.state, "refresh_session_cookie", None)
    already = any(k.lower() == "set-cookie" and sessions.COOKIE_NAME in v
                  for k, v in response.headers.items())
    if token and not already:
        auth.set_session_cookie(response, token)
    return response


@app.get("/health")
def health() -> dict:
    return {"ok": True}
