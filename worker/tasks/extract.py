"""추출 작업: 유튜브 → 오디오만 다운로드 → 44.1kHz 스테레오 mp3 → 파형 peaks (PLAN 7장, CONTRACT 2-2).

진행률 배분: 영상 정보 0→5, 다운로드 5→80, 변환 80→90, 파형 90→99, 끝 100.
"""
from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

import yt_dlp
from celery.exceptions import SoftTimeLimitExceeded

from app import config, queue, store
from app.error_codes import error_body
from worker import media, ytdlp_cli
from worker.celery_app import celery_app

log = logging.getLogger(__name__)

# 변환 · 파형에 걸리는 시간 어림값 (원곡 1초당 초)
POST_PROCESS_SEC_PER_AUDIO_SEC = 0.03
MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024

# 영상 자체 문제 → VIDEO_UNAVAILABLE. 그 밖(봇 확인, 네트워크, yt-dlp 고장)은 EXTRACT_FAILED
UNAVAILABLE_HINTS = (
    "video unavailable", "private video", "confirm your age", "age-restricted",
    "has been removed", "copyright", "members-only", "join this channel",
    "not available in your country", "premieres in", "this live event",
)


class ExtractError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code


def _post_eta(duration: float | None) -> int:
    return max(1, round((duration or 0) * POST_PROCESS_SEC_PER_AUDIO_SEC))


def _track_info(track_id: str, info: dict, duration: float | None) -> dict:
    return {
        "trackId": track_id,
        "title": info.get("title") or "",
        "channel": info.get("channel") or info.get("uploader") or "",
        "durationSec": float(duration) if duration is not None else None,
        "thumbnailUrl": info.get("thumbnail") or "",
    }


class _ProgressHook:
    """yt-dlp 다운로드 진행률 → 작업 progress 5~80. Redis 쓰기는 0.5초에 한 번."""

    def __init__(self, job_id: str, duration: float | None):
        self.job_id = job_id
        self.post_eta = _post_eta(duration)
        self.last_write = 0.0

    def __call__(self, d: dict) -> None:
        if d.get("status") != "downloading":
            return
        now = time.monotonic()
        if now - self.last_write < 0.5:
            return
        self.last_write = now
        total = d.get("total_bytes") or d.get("total_bytes_estimate")
        done = d.get("downloaded_bytes") or 0
        if total and total > MAX_DOWNLOAD_BYTES:
            raise ExtractError("TOO_LONG", f"파일이 너무 큼: {total} bytes")
        fraction = min(done / total, 1.0) if total else 0.0
        eta = d.get("eta")
        store.update_job(
            self.job_id,
            progress=5 + int(fraction * 75),
            etaSeconds=int(eta) + self.post_eta if eta is not None else None,
        )


def _ydl_opts(work_dir: Path, hook=None) -> dict:
    opts = {
        "format": "bestaudio/best",
        "noplaylist": True,          # --no-playlist
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "outtmpl": str(work_dir / "source.%(ext)s"),
        "socket_timeout": 20,
        "retries": 3,
        "max_filesize": MAX_DOWNLOAD_BYTES,
        "cachedir": False,
    }
    if hook:
        opts["progress_hooks"] = [hook]
    return opts


def _classify_download_error(e: Exception) -> str:
    msg = str(e).lower()
    return "VIDEO_UNAVAILABLE" if any(h in msg for h in UNAVAILABLE_HINTS) else "EXTRACT_FAILED"


def _from_download_error(e: yt_dlp.utils.DownloadError) -> Exception:
    """yt-dlp가 감싼 예외를 풀어서 돌려준다.

    작업 타임아웃(SoftTimeLimitExceeded)이나 진행률 훅의 ExtractError가
    DownloadError 안에 들어 있으면 원래 예외를 그대로 쓴다 → TIMEOUT / TOO_LONG.
    """
    inner = e.exc_info[1] if getattr(e, "exc_info", None) else None
    if isinstance(inner, (SoftTimeLimitExceeded, ExtractError)):
        return inner
    return ExtractError(_classify_download_error(e), str(e))


def _accept_info(job_id: str, track_id: str, info: dict | None, hook: "_ProgressHook"):
    """영상 정보 검사 + track 먼저 채우기 (CONTRACT 2-2). 두 받기 방식이 같이 쓴다."""
    if info is None or info.get("_type") == "playlist":
        raise ExtractError("PLAYLIST_NOT_ALLOWED", "playlist")  # normalize_url이 막으므로 오지 않음
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        raise ExtractError("VIDEO_UNAVAILABLE", "live")
    duration = info.get("duration")
    if duration is not None and duration > config.MAX_DURATION_SEC:
        raise ExtractError("TOO_LONG", f"duration={duration}")
    meta = _track_info(track_id, info, duration)
    store.update_track(track_id, **{k: v for k, v in meta.items() if k != "trackId"})
    hook.post_eta = _post_eta(duration)
    store.update_job(job_id, progress=5, track=meta)
    return meta, duration


def _fetch_with_library(job_id, track_id, url, work_dir, hook):
    """서버 모드: 파이썬 yt_dlp 라이브러리."""
    with yt_dlp.YoutubeDL(_ydl_opts(work_dir, hook)) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except yt_dlp.utils.DownloadError as e:
            raise _from_download_error(e) from e
        meta, duration = _accept_info(job_id, track_id, info, hook)
        try:
            ydl.process_ie_result(info, download=True)
        except yt_dlp.utils.DownloadError as e:
            raise _from_download_error(e) from e
    return meta, duration


def _fetch_with_cli(job_id, track_id, url, work_dir, hook):
    """데스크톱: yt-dlp 실행 파일 (결정 73). 진행률 · 에러 분류 · 너무 큰 파일 검사는 라이브러리와 같다."""
    try:
        info = ytdlp_cli.fetch_info(url, timeout=config.EXTRACT_TIMEOUT_SEC)
        meta, duration = _accept_info(job_id, track_id, info, hook)
        ytdlp_cli.download(info, work_dir, hook, timeout=config.EXTRACT_TIMEOUT_SEC,
                           max_bytes=MAX_DOWNLOAD_BYTES)
    except ytdlp_cli.CliTimeout as e:
        raise ExtractError("TIMEOUT", str(e)) from e
    except ytdlp_cli.CliError as e:
        msg = str(e)
        if "max-filesize" in msg.lower():
            raise ExtractError("TOO_LONG", msg) from e
        raise ExtractError(_classify_download_error(e), msg) from e
    return meta, duration


def run_extract(job_id: str, track_id: str) -> None:
    track = store.get_track(track_id)
    if track is None or store.get_job(job_id) is None:
        log.warning("extract: 기록 없음 job=%s track=%s", job_id, track_id)
        return

    config.TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    work_dir = config.TRACKS_DIR / f"{track_id}.work"
    work_dir.mkdir(exist_ok=True)
    final_audio = config.track_audio_path(track_id)
    try:
        store.update_job(job_id, status="running", progress=0, etaSeconds=None)
        store.update_track(track_id, status="running")

        # 1) 영상 정보 → 2) 오디오만 다운로드
        hook = _ProgressHook(job_id, None)
        if ytdlp_cli.enabled():
            meta, duration = _fetch_with_cli(job_id, track_id, track["url"], work_dir, hook)
        else:
            meta, duration = _fetch_with_library(job_id, track_id, track["url"], work_dir, hook)

        sources = [p for p in work_dir.iterdir() if p.name.startswith("source.") and not p.name.endswith(".part")]
        if not sources:
            raise ExtractError("EXTRACT_FAILED", "다운로드 파일 없음")

        # 3) 44.1kHz 스테레오 mp3로 변환
        store.update_job(job_id, progress=80, etaSeconds=_post_eta(duration))
        tmp_audio = work_dir / "converted.mp3"
        media.convert_to_mp3(sources[0], tmp_audio)
        real_duration = media.probe_duration(tmp_audio)
        if real_duration > config.MAX_DURATION_SEC + 1:
            raise ExtractError("TOO_LONG", f"real duration={real_duration}")

        # 4) 파형
        store.update_job(job_id, progress=90, etaSeconds=1)
        peaks = media.compute_peaks(tmp_audio, real_duration)
        tmp_audio.replace(final_audio)
        media.write_peaks(config.track_peaks_path(track_id), track_id, real_duration, peaks)

        meta = {**meta, "durationSec": real_duration}
        store.update_track(track_id, status="done", durationSec=real_duration)
        store.update_job(job_id, status="done", etaSeconds=0, track=meta, result={"track": meta})
    except SoftTimeLimitExceeded:
        _fail(job_id, track_id, "TIMEOUT", "soft time limit")
    except ExtractError as e:
        _fail(job_id, track_id, e.code, str(e))
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 쉬운 문구로
        log.exception("extract 실패 job=%s", job_id)
        _fail(job_id, track_id, "EXTRACT_FAILED", repr(e))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _fail(job_id: str, track_id: str, code: str, detail: str) -> None:
    log.info("extract failed job=%s code=%s detail=%s", job_id, code, detail[:300])
    store.update_track(track_id, status="failed")
    store.fail_job(job_id, error_body(code))
    for p in (config.track_audio_path(track_id), config.track_peaks_path(track_id)):
        p.unlink(missing_ok=True)


@celery_app.task(
    name=queue.EXTRACT_TASK,
    soft_time_limit=config.EXTRACT_TIMEOUT_SEC,
    time_limit=config.EXTRACT_TIMEOUT_SEC + 30,
)
def extract_track(job_id: str, track_id: str) -> None:
    run_extract(job_id, track_id)
