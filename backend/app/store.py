"""Redis 저장소: 작업(job) · 노래(track) · 내보내기(export) 기록.

모든 키는 만들 때 24시간 TTL이 걸리고, 갱신해도 TTL은 유지된다 (KEEPTTL).
작업 기록은 GET /jobs/{id} 응답 모양(CONTRACT 2-2) 그대로 저장한다.
"""
from __future__ import annotations

import json
import time
import uuid
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


def _get(key: str) -> dict | None:
    raw = get_redis().get(key)
    return json.loads(raw) if raw else None


def _create(key: str, value: dict) -> None:
    get_redis().set(key, json.dumps(value, ensure_ascii=False), ex=config.FILE_TTL_SEC)


def _update(key: str, value: dict) -> None:
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
