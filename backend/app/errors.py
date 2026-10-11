"""에러 형식 (CONTRACT 4장). HTTP 에러와 작업 error 필드가 같은 모양을 쓴다."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

MESSAGES = {
    "INVALID_URL": "유튜브 주소가 아니에요. 주소를 다시 확인해 주세요.",
    "PLAYLIST_NOT_ALLOWED": "재생목록은 가져올 수 없어요. 노래 영상 하나의 주소를 넣어주세요.",
    "TOO_LONG": "20분이 넘는 영상은 가져올 수 없어요.",
    "VIDEO_UNAVAILABLE": "이 영상은 가져올 수 없어요. 다른 영상을 골라주세요.",
    "EXTRACT_FAILED": "노래를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.",
    "EXPORT_FAILED": "노래를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    "TIMEOUT": "시간이 너무 오래 걸려서 멈췄어요. 잠시 후 다시 시도해 주세요.",
    "INVALID_EDIT": "편집 내용에 문제가 있어요. 다시 확인해 주세요.",
    "NOT_FOUND": "노래를 찾을 수 없어요. 처음부터 다시 해주세요.",
    "NOT_READY": "아직 준비 중이에요. 잠시만 기다려 주세요.",
    "RATE_LIMITED": "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    "INTERNAL": "문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
}

STATUS = {
    "INVALID_URL": 400,
    "PLAYLIST_NOT_ALLOWED": 400,
    "INVALID_EDIT": 422,
    "NOT_FOUND": 404,
    "NOT_READY": 409,
    "RATE_LIMITED": 429,
    "INTERNAL": 500,
}


def error_body(code: str, detail: str | None = None) -> dict:
    """작업 error 필드 / HTTP 응답 안쪽 객체."""
    body = {"code": code, "message": MESSAGES[code]}
    if detail:
        body["detail"] = detail
    return body


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
        code = "INVALID_URL" if request.url.path == "/tracks" else "INVALID_EDIT"
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
