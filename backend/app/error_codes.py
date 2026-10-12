"""에러 코드 · 문구 (CONTRACT 4장). fastapi 없이 import 되어야 한다 (worker 이미지에서도 사용)."""
from __future__ import annotations

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
    "UNAUTHORIZED": "로그인이 필요해요. 다시 로그인해 주세요.",
    "LOGIN_FAILED": "아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.",
    "LOGIN_LOCKED": "여러 번 틀려서 잠시 막혔어요. 15분 뒤에 다시 해 주세요.",
    "SAVE_FAILED": "컴퓨터에 저장하지 못했어요. 다시 눌러 주세요.",
}

STATUS = {
    "INVALID_URL": 400,
    "PLAYLIST_NOT_ALLOWED": 400,
    "INVALID_EDIT": 422,
    "NOT_FOUND": 404,
    "NOT_READY": 409,
    "RATE_LIMITED": 429,
    "INTERNAL": 500,
    "UNAUTHORIZED": 401,
    "LOGIN_FAILED": 401,
    "LOGIN_LOCKED": 429,
    "SAVE_FAILED": 500,
}


def error_body(code: str, detail: str | None = None) -> dict:
    """작업 error 필드 / HTTP 응답 안쪽 객체."""
    body = {"code": code, "message": MESSAGES[code]}
    if detail:
        body["detail"] = detail
    return body
