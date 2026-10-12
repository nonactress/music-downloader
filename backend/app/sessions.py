"""로그인 세션 (CONTRACT 5-1, 결정 56 · 58).

- 쿠키 `em_session` = 무작위 토큰. Redis에는 토큰의 sha256만 키로 둔다
  (Redis 내용이 새어도 그대로 쿠키로 쓸 수 없게).
- 마지막 사용부터 30일. 쓸 때마다 Redis TTL을 늘리고, 쿠키 Max-Age는 하루에 한 번 다시 보낸다.
- 사용자별 세션 목록을 두어 비밀번호를 바꾸거나 계정을 지우면 그 사람 세션을 모두 끊는다.
- 틀린 로그인: 같은 아이디 15분 5번 · 같은 IP 15분 20번이면 15분 잠금.
"""
from __future__ import annotations

import hashlib
import secrets

from . import config
from .store import get_redis

COOKIE_NAME = "em_session"
COOKIE_REFRESH_SEC = 24 * 3600  # 남은 기간이 30일 - 하루보다 줄면 쿠키를 다시 보냄


def _key(token: str) -> str:
    return "session:" + hashlib.sha256(token.encode()).hexdigest()


def _user_key(login_id: str) -> str:
    return f"user_sessions:{login_id}"


def create(login_id: str) -> str:
    token = secrets.token_urlsafe(32)
    key = _key(token)
    r = get_redis()
    pipe = r.pipeline()
    pipe.set(key, login_id, ex=config.SESSION_TTL_SEC)
    pipe.sadd(_user_key(login_id), key)
    pipe.expire(_user_key(login_id), config.SESSION_TTL_SEC)
    pipe.execute()
    return token


def lookup(token: str | None) -> tuple[str, bool] | None:
    """(아이디, 쿠키를 다시 보내야 하는지). 쓸 때마다 30일로 늘린다. 없으면 None."""
    if not token or len(token) > 200:
        return None
    key = _key(token)
    r = get_redis()
    login_id = r.get(key)
    if login_id is None:
        return None
    remaining = r.ttl(key)
    r.expire(key, config.SESSION_TTL_SEC)
    r.expire(_user_key(login_id), config.SESSION_TTL_SEC)
    return login_id, remaining < config.SESSION_TTL_SEC - COOKIE_REFRESH_SEC


def delete(token: str | None) -> None:
    if not token or len(token) > 200:
        return
    key = _key(token)
    r = get_redis()
    login_id = r.get(key)
    r.delete(key)
    if login_id:
        r.srem(_user_key(login_id), key)


def delete_all_for(login_id: str) -> int:
    """그 사람의 모든 세션을 끊는다 (비밀번호 변경 · 계정 삭제)."""
    r = get_redis()
    keys = list(r.smembers(_user_key(login_id)))
    if keys:
        r.delete(*keys)
    r.delete(_user_key(login_id))
    return len(keys)


# ---- 틀린 로그인 막기 (결정 58) -----------------------------------------------

def _fail_keys(login_id: str, ip: str) -> list[tuple[str, str, int]]:
    return [
        (f"loginfail:id:{login_id}", f"loginlock:id:{login_id}", config.LOGIN_FAIL_LIMIT_ID),
        (f"loginfail:ip:{ip}", f"loginlock:ip:{ip}", config.LOGIN_FAIL_LIMIT_IP),
    ]


def is_locked(login_id: str, ip: str) -> bool:
    r = get_redis()
    return any(r.exists(lock) for _, lock, _ in _fail_keys(login_id, ip))


def record_failure(login_id: str, ip: str) -> None:
    """15분 안에 한도만큼 틀리면 그때부터 15분 잠금."""
    r = get_redis()
    window = config.LOGIN_FAIL_WINDOW_SEC
    for counter, lock, limit in _fail_keys(login_id, ip):
        count = r.incr(counter)
        if count == 1:
            r.expire(counter, window)
        if count >= limit:
            r.set(lock, 1, ex=window)
            r.delete(counter)


def clear_failures(login_id: str) -> None:
    """맞게 로그인하면 그 아이디의 틀린 횟수는 지운다 (IP 쪽은 그대로)."""
    get_redis().delete(f"loginfail:id:{login_id}")
