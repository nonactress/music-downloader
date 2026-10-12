"""에러 응답 핸들러 (CONTRACT 4장). HTTP 에러와 작업 error 필드가 같은 모양을 쓴다."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .error_codes import MESSAGES, STATUS, error_body  # noqa: F401 (재노출)


class ApiError(Exception):
    def __init__(self, code: str, detail: str | None = None):
        self.code = code
        self.detail = detail
        self.status = STATUS[code]


def _response(code: str, detail: str | None = None) -> JSONResponse:
    return JSONResponse({"error": error_body(code, detail)}, status_code=STATUS[code])


def _validation_detail(exc: RequestValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(p) for p in e.get('loc', ()) if p != 'body')}: {e.get('msg')}"
        for e in exc.errors()
    )


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return _response(exc.code, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        # FastAPI 기본 422를 CONTRACT 형식으로 바꾼다
        code = {"/tracks": "INVALID_URL", "/auth/login": "LOGIN_FAILED"}.get(request.url.path, "INVALID_EDIT")
        return _response(code, _validation_detail(exc))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            return _response("NOT_FOUND")
        return JSONResponse(
            {"error": {"code": "INTERNAL", "message": MESSAGES["INTERNAL"], "detail": str(exc.detail)}},
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return _response("INTERNAL")
