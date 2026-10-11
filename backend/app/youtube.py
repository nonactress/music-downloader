"""유튜브 주소 검사 (CONTRACT 2-1, PLAN 12장).

허용 호스트만 받고, 영상 ID를 뽑아 표준 주소로 다시 만든다.
→ yt-dlp에는 사용자가 넣은 문자열이 아니라 `https://www.youtube.com/watch?v=<ID>`만 넘어간다.
"""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

from .errors import ApiError

ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
# /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
PATH_ID_PREFIXES = ("shorts", "embed", "live", "v")
MAX_URL_LENGTH = 2048


def _video_id(host: str, path: str, query: dict[str, list[str]]) -> str | None:
    parts = [p for p in path.split("/") if p]
    if host == "youtu.be":
        candidate = parts[0] if parts else None
    elif path in ("/watch", "/watch/"):
        candidate = (query.get("v") or [None])[0]
    elif len(parts) >= 2 and parts[0] in PATH_ID_PREFIXES:
        candidate = parts[1]
    else:
        candidate = None
    if candidate and VIDEO_ID_RE.match(candidate):
        return candidate
    return None


def normalize_url(raw: str) -> str:
    """허용된 유튜브 영상 주소면 표준 주소를, 아니면 ApiError를 던진다."""
    text = (raw or "").strip()
    if not text or len(text) > MAX_URL_LENGTH or any(c.isspace() for c in text):
        raise ApiError("INVALID_URL")
    if "://" not in text:
        # "youtube.com/watch?v=..." 처럼 http 없이 붙여넣은 경우
        text = "https://" + text
    try:
        parts = urlsplit(text)
        host = (parts.hostname or "").lower()
        _ = parts.port  # 잘못된 포트면 ValueError
    except ValueError:
        raise ApiError("INVALID_URL")
    if parts.scheme not in ("http", "https") or parts.username or parts.password:
        raise ApiError("INVALID_URL")
    if host not in ALLOWED_HOSTS:
        raise ApiError("INVALID_URL")

    query = parse_qs(parts.query)
    video_id = _video_id(host, parts.path, query)
    if video_id:
        # watch?v=...&list=... → 영상 하나만
        return f"https://www.youtube.com/watch?v={video_id}"
    if parts.path.rstrip("/") == "/playlist" or "list" in query:
        raise ApiError("PLAYLIST_NOT_ALLOWED")
    raise ApiError("INVALID_URL")
