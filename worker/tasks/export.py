"""내보내기 작업: Edit JSON → ffmpeg 1회 렌더링 → mp3 (PLAN 10장, CONTRACT 2-2).

진행률: ffmpeg -progress의 out_time / 예상 결과 길이 → 0~99, 끝 100.
"""
from __future__ import annotations

import logging
import subprocess
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from celery.exceptions import SoftTimeLimitExceeded

from app import config, queue, store
from app.error_codes import error_body
from app.ffmpeg_builder import TrackEdit, build_command, total_duration
from worker import media
from worker.celery_app import celery_app

log = logging.getLogger(__name__)


class ExportError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code


def file_name(now: datetime | None = None) -> str:
    """`내 노래_MMDD.mp3` (Asia/Seoul 기준)."""
    now = now or datetime.now(ZoneInfo(config.TIMEZONE))
    return f"내 노래_{now:%m%d}.mp3"


def _parse_out_time(line: str) -> float | None:
    """ffmpeg -progress 줄에서 현재 출력 위치(초)."""
    key, _, value = line.strip().partition("=")
    if key in ("out_time_us", "out_time_ms") and value.isdigit():
        return int(value) / 1_000_000  # 둘 다 마이크로초 (ffmpeg 관례)
    return None


def _render(job_id: str, cmd: list[str], expected: float, log_path) -> None:
    cmd = cmd[:-1] + ["-progress", "pipe:1", "-nostats", "-loglevel", "error"] + cmd[-1:]
    started = time.monotonic()
    last_write = 0.0
    with open(log_path, "wb") as err:
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=err, text=True)
        try:
            for line in proc.stdout:
                pos = _parse_out_time(line)
                now = time.monotonic()
                if pos is None or expected <= 0 or now - last_write < 0.5:
                    continue
                last_write = now
                fraction = min(pos / expected, 1.0)
                elapsed = now - started
                eta = round(elapsed / fraction - elapsed) if fraction > 0.02 else None
                store.update_job(job_id, progress=int(fraction * 99), etaSeconds=eta)
            proc.wait()
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    if proc.returncode != 0:
        tail = log_path.read_bytes()[-500:].decode("utf-8", "replace")
        raise ExportError("EXPORT_FAILED", f"ffmpeg exit {proc.returncode}: {tail}")


def run_export(job_id: str, export_id: str, edit: dict) -> None:
    if store.get_export(export_id) is None or store.get_job(job_id) is None:
        log.warning("export: 기록 없음 job=%s export=%s", job_id, export_id)
        return

    config.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = config.export_path(export_id)
    tmp = out.with_name(f"{export_id}.tmp.mp3")
    log_path = out.with_name(f"{export_id}.log")
    try:
        store.update_job(job_id, status="running", progress=0, etaSeconds=None)
        store.update_export(export_id, status="running")

        tracks = [TrackEdit(t["start"], t["end"], t["speed"], t["keepPitch"]) for t in edit["tracks"]]
        inputs = [config.track_audio_path(t["sourceId"]) for t in edit["tracks"]]
        missing = [str(p.name) for p in inputs if not p.exists()]
        if missing:
            raise ExportError("EXPORT_FAILED", f"원곡 파일 없음: {missing}")

        crossfade = float(edit["crossfade"])
        expected = total_duration(tracks, crossfade)
        cmd = build_command([str(p) for p in inputs], tracks, crossfade,
                            bool(edit["normalize"]), str(tmp))
        _render(job_id, cmd, expected, log_path)

        duration = media.probe_duration(tmp)
        tmp.replace(out)
        result = {
            "exportId": export_id,
            "fileName": file_name(),
            "trackCount": len(tracks),
            "durationSec": duration,
            "sizeBytes": out.stat().st_size,
        }
        store.update_export(export_id, status="done", **result)
        store.update_job(job_id, status="done", etaSeconds=0, result=result)
    except SoftTimeLimitExceeded:
        _fail(job_id, export_id, "TIMEOUT", "soft time limit")
    except ExportError as e:
        _fail(job_id, export_id, e.code, str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("export 실패 job=%s", job_id)
        _fail(job_id, export_id, "EXPORT_FAILED", repr(e))
    finally:
        tmp.unlink(missing_ok=True)
        log_path.unlink(missing_ok=True)


def _fail(job_id: str, export_id: str, code: str, detail: str) -> None:
    log.info("export failed job=%s code=%s detail=%s", job_id, code, detail[:500])
    store.update_export(export_id, status="failed")
    store.fail_job(job_id, error_body(code))
    config.export_path(export_id).unlink(missing_ok=True)


@celery_app.task(
    name=queue.EXPORT_TASK,
    soft_time_limit=config.EXPORT_TIMEOUT_SEC,
    time_limit=config.EXPORT_TIMEOUT_SEC + 30,
)
def render_export(job_id: str, export_id: str, edit: dict) -> None:
    run_export(job_id, export_id, edit)
