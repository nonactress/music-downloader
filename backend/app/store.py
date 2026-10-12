"""작업(job) · 노래(track) · 내보내기(export) 기록.

서버 모드: Redis. 데스크톱 모드(결정 66): META_DIR의 JSON 파일(기록 하나 = 파일 하나) — 껐다 켜도 남는다.
모든 기록은 만들 때 24시간 만료가 걸리고, 갱신해도 만료 시각은 그대로다 (KEEPTTL).
작업 기록은 GET /jobs/{id} 응답 모양(CONTRACT 2-2) 그대로 저장한다.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import redis

from . import config

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(config.REDIS_URL, decode_responses=True)
    return _client


def set_redis(client: redis.Redis | None) -> None:
    """테스트용 교체."""
    global _client
    _client = client


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


# ---- 데스크톱: 파일 저장소 ---------------------------------------------------

_KEY_RE = re.compile(r"^(job|track|export):[A-Za-z0-9_-]{1,80}$")
_file_lock = threading.RLock()


def _file_path(key: str) -> Path | None:
    """주소창에서 온 id도 키가 되므로, 모양이 맞을 때만 파일 이름으로 쓴다 (경로 조작 차단)."""
    if not _KEY_RE.match(key):
        return None
    return config.META_DIR / (key.replace(":", "__") + ".json")


def _file_read(path: Path) -> dict | None:
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None
    if entry.get("expiresAt", 0) <= time.time():
        path.unlink(missing_ok=True)
        return None
    return entry


def _file_write(path: Path, value: dict, expires_at: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"expiresAt": expires_at, "value": value}, f, ensure_ascii=False)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _file_get(key: str) -> dict | None:
    path = _file_path(key)
    if path is None:
        return None
    with _file_lock:
        entry = _file_read(path)
    return entry["value"] if entry else None


def _file_set(key: str, value: dict, keep_expiry: bool) -> None:
    path = _file_path(key)
    if path is None:
        raise ValueError(f"잘못된 키: {key}")
    with _file_lock:
        old = _file_read(path) if keep_expiry else None
        expires_at = old["expiresAt"] if old else time.time() + config.FILE_TTL_SEC
        _file_write(path, value, expires_at)


def purge_expired() -> int:
    """만료된 기록 파일을 지운다 (데스크톱 정리 스레드)."""
    removed = 0
    if not config.META_DIR.is_dir():
        return 0
    with _file_lock:
        for path in config.META_DIR.glob("*.json"):
            if _file_read(path) is None:
                path.unlink(missing_ok=True)
                removed += 1
    return removed


def fail_unfinished() -> int:
    """프로그램을 다시 켰을 때: 끌 때 하던 작업은 failed INTERNAL (결정 66)."""
    from .error_codes import error_body

    if not config.META_DIR.is_dir():
        return 0
    failed = 0
    with _file_lock:
        for path in config.META_DIR.glob("*.json"):
            entry = _file_read(path)
            if entry is None or entry["value"].get("status") not in ("queued", "running"):
                continue
            value = entry["value"]
            value["status"] = "failed"
            if path.name.startswith("job__"):
                value["etaSeconds"] = None
                value["error"] = error_body("INTERNAL")
                failed += 1
            _file_write(path, value, entry["expiresAt"])
    return failed


# ---- 공통 -------------------------------------------------------------------

def _get(key: str) -> dict | None:
    if config.DESKTOP:
        return _file_get(key)
    raw = get_redis().get(key)
    return json.loads(raw) if raw else None


def _create(key: str, value: dict) -> None:
    if config.DESKTOP:
        _file_set(key, value, keep_expiry=False)
        return
    get_redis().set(key, json.dumps(value, ensure_ascii=False), ex=config.FILE_TTL_SEC)


def _update(key: str, value: dict) -> None:
    if config.DESKTOP:
        _file_set(key, value, keep_expiry=True)
        return
    r = get_redis()
    if r.ttl(key) > 0:
        r.set(key, json.dumps(value, ensure_ascii=False), keepttl=True)
    else:
        r.set(key, json.dumps(value, ensure_ascii=False), ex=config.FILE_TTL_SEC)


# ---- 작업 (job) -------------------------------------------------------------

def create_job(kind: str, owner: str | None = None) -> dict:
    """owner: 만든 사람 아이디 (결정 57). GET /jobs 응답에서는 빠진다."""
    job = {
        "jobId": new_id("j"),
        "kind": kind,
        "status": "queued",
        "progress": 0,
        "etaSeconds": None,
        "track": None,
        "result": None,
        "error": None,
        "owner": owner,
    }
    _create(f"job:{job['jobId']}", job)
    return job


def get_job(job_id: str) -> dict | None:
    return _get(f"job:{job_id}")


def update_job(job_id: str, **fields: Any) -> dict | None:
    """progress는 줄어들지 않고, done/failed가 된 작업은 더 바꾸지 않는다."""
    job = get_job(job_id)
    if job is None or job["status"] in ("done", "failed"):
        return job
    if "progress" in fields:
        fields["progress"] = max(job["progress"], min(int(fields["progress"]), 100))
    job.update(fields)
    if job["status"] == "done":
        job["progress"] = 100
    elif job["status"] == "running":
        job["progress"] = min(job["progress"], 99)
    _update(f"job:{job_id}", job)
    return job


def fail_job(job_id: str, error: dict) -> dict | None:
    return update_job(job_id, status="failed", etaSeconds=None, error=error)


# ---- 노래 (track) -----------------------------------------------------------
# {"trackId", "jobId", "status": queued|running|done|failed, "title", "channel",
#  "durationSec", "thumbnailUrl", "url"}

def create_track(job_id: str, url: str, owner: str | None = None) -> dict:
    track = {"trackId": new_id("t"), "jobId": job_id, "status": "queued", "url": url, "owner": owner}
    _create(f"track:{track['trackId']}", track)
    return track


def get_track(track_id: str) -> dict | None:
    return _get(f"track:{track_id}")


def update_track(track_id: str, **fields: Any) -> dict | None:
    track = get_track(track_id)
    if track is None:
        return None
    track.update(fields)
    _update(f"track:{track_id}", track)
    return track


# ---- 내보내기 (export) ------------------------------------------------------
# {"exportId", "jobId", "status", "fileName", "trackCount", "durationSec", "sizeBytes"}

def create_export(job_id: str, owner: str | None = None) -> dict:
    exp = {"exportId": new_id("e"), "jobId": job_id, "status": "queued", "owner": owner}
    _create(f"export:{exp['exportId']}", exp)
    return exp


def get_export(export_id: str) -> dict | None:
    return _get(f"export:{export_id}")


def update_export(export_id: str, **fields: Any) -> dict | None:
    exp = get_export(export_id)
    if exp is None:
        return None
    exp.update(fields)
    _update(f"export:{export_id}", exp)
    return exp


def owned(record: dict | None, login_id: str) -> dict | None:
    """만든 사람이 맞을 때만 기록을 돌려준다. 남의 것 · 주인 없는 옛 기록은 None → 404 (결정 57)."""
    if record is None or record.get("owner") is None or record.get("owner") != login_id:
        return None
    return record


# ---- 요청 수 제한 -----------------------------------------------------------

def hit_rate_limit(scope: str, ip: str, limit: int, window_sec: int = 60) -> bool:
    """window 안에서 limit번을 넘으면 True (고정 창, IP · 경로별)."""
    r = get_redis()
    key = f"rl:{scope}:{ip}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, window_sec)
    return count > limit


def take_daily_track(ip: str, limit: int, window_sec: int = 24 * 3600) -> bool:
    """IP당 window 안에 받은 노래 수가 limit 미만이면 하나를 기록하고 True (결정 52).

    지난 24시간을 미끄러지는 창으로 센다 (정렬 집합에 받은 시각을 남김).
    먼저 넣고 세어서, 동시에 들어온 요청이 한도를 넘기면 자기 것을 빼고 거절한다.
    """
    if limit <= 0:
        return True
    r = get_redis()
    key = f"daily:tracks:{ip}"
    now = time.time()
    member = f"{now:.6f}:{uuid.uuid4().hex[:8]}"
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, "-inf", now - window_sec)
    pipe.zadd(key, {member: now})
    pipe.zcard(key)
    pipe.expire(key, window_sec)
    count = pipe.execute()[2]
    if count > limit:
        r.zrem(key, member)
        return False
    return True
