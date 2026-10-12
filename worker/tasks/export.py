"""내보내기 작업: Edit JSON → ffmpeg 1회 렌더링 → mp3 (PLAN 10장, CONTRACT 2-2).

진행률: (소리 크기 맞추기면) 곡별 소리 크기 측정 0→15, 렌더링은 ffmpeg -progress의 out_time /
예상 결과 길이 → 15~99, 끝 100.
"""
from __future__ import annotations

import logging
import os
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from zoneinfo import ZoneInfo


from app import config, store
from app.error_codes import error_body
from app.ffmpeg_builder import TrackEdit, build_command, normalize_gain_db, total_duration
from worker import media
from worker.compat import SoftTimeLimitExceeded

log = logging.getLogger(__name__)

MEASURE_PROGRESS = 15  # 소리 크기 측정이 차지하는 진행률
MEASURE_WORKERS = max(1, min(4, os.cpu_count() or 1))


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


def _measure_gains(job_id: str, inputs: list, tracks: list[TrackEdit]) -> list[float]:
    """곡별 소리 크기 맞추기 음량(dB). ebur128 측정을 곡마다 동시에 돌린다."""
    gains: list[float | None] = [None] * len(tracks)
    pool = ThreadPoolExecutor(max_workers=MEASURE_WORKERS)
    try:
        futures = {pool.submit(media.measure_loudness, p, t.start, t.end): i
                   for i, (p, t) in enumerate(zip(inputs, tracks))}
        for done, fut in enumerate(as_completed(futures), start=1):
            loudness, peak = fut.result()
            gains[futures[fut]] = normalize_gain_db(loudness, peak)
            store.update_job(job_id, progress=MEASURE_PROGRESS * done // len(tracks))
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return gains


def _render(job_id: str, cmd: list[str], expected: float, log_path, base: int = 0,
            timeout: float | None = None) -> None:
    """ffmpeg 실행 + 진행률. timeout초가 지나면 ffmpeg를 끊고 TIMEOUT
    (데스크톱 스레드 작업자에는 Celery soft_time_limit이 없으므로 직접 지킨다)."""
    cmd = cmd[:-1] + ["-progress", "pipe:1", "-nostats", "-loglevel", "error"] + cmd[-1:]
    timeout = config.EXPORT_TIMEOUT_SEC if timeout is None else timeout
    started = time.monotonic()
    last_write = 0.0
    timed_out = threading.Event()
    with open(log_path, "wb") as err:
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=err, text=True, encoding="utf-8", errors="replace",
                                **media.popen_flags())

        def _kill_on_timeout():
            timed_out.set()
            if proc.poll() is None:
                proc.kill()

        watchdog = threading.Timer(timeout, _kill_on_timeout)
        watchdog.daemon = True
        watchdog.start()
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
                store.update_job(job_id, progress=base + int(fraction * (99 - base)), etaSeconds=eta)
            proc.wait()
        finally:
            watchdog.cancel()
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    if timed_out.is_set():
        raise ExportError("TIMEOUT", f"ffmpeg가 {timeout}초를 넘음")
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
        normalize = bool(edit["normalize"])
        expected = total_duration(tracks, crossfade)
        gains = _measure_gains(job_id, inputs, tracks) if normalize else None
        cmd = build_command([str(p) for p in inputs], tracks, crossfade,
                            normalize, str(tmp), gains_db=gains)
        _render(job_id, cmd, expected, log_path, base=MEASURE_PROGRESS if normalize else 0)

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
