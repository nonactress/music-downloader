"""데스크톱 모드 작업자 (결정 66): Celery · Redis 대신 같은 프로세스 안의 스레드.

- 추출 동시 2개, 내보내기 동시 1개 (config.DESKTOP_*_WORKERS)
- 켤 때: 지난번에 끄면서 남은 작업은 failed INTERNAL, 24시간 지난 파일 · 기록 정리
- 그 뒤 1시간마다 정리 (결정 67)
작업 함수는 서버 모드 Celery 작업과 같은 run_extract · run_export를 그대로 쓴다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import Future, ThreadPoolExecutor

from . import config, queue, store

log = logging.getLogger(__name__)

CLEANUP_INTERVAL_SEC = 3600

_pools: dict[str, ThreadPoolExecutor] = {}
_stop = threading.Event()
_cleanup_thread: threading.Thread | None = None
_active = 0  # 줄 서 있거나 하고 있는 추출 · 내보내기 수
_active_lock = threading.Lock()


def _task(name: str):
    """작업 이름 → 실행 함수. worker 코드는 처음 쓸 때 불러온다."""
    if name == queue.EXTRACT_TASK:
        from worker.tasks.extract import run_extract
        return run_extract, "extract"
    if name == queue.EXPORT_TASK:
        from worker.tasks.export import run_export
        return run_export, "export"
    if name == queue.CLEANUP_TASK:
        return lambda: cleanup_once(), "misc"
    raise ValueError(f"모르는 작업: {name}")


def _pool(kind: str) -> ThreadPoolExecutor:
    if kind not in _pools:
        workers = {"extract": config.DESKTOP_EXTRACT_WORKERS,
                   "export": config.DESKTOP_EXPORT_WORKERS}.get(kind, 1)
        _pools[kind] = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"easymusic-{kind}")
    return _pools[kind]


def _add_active(delta: int) -> None:
    global _active
    with _active_lock:
        _active += delta


def submit(name: str, *args) -> Future:
    fn, kind = _task(name)
    counted = kind in ("extract", "export")

    def run():
        try:
            fn(*args)
        except Exception:  # noqa: BLE001 — run_*는 실패를 작업 기록에 남김. 여기까지 오면 로그만
            log.exception("데스크톱 작업 실패: %s", name)
        finally:
            if counted:
                _add_active(-1)

    if counted:
        _add_active(1)
    try:
        return _pool(kind).submit(run)
    except RuntimeError:  # 끄는 중
        if counted:
            _add_active(-1)
        raise


def cleanup_once() -> None:
    from worker.tasks.cleanup import run_cleanup

    removed = run_cleanup() + store.purge_expired()
    if removed:
        log.info("정리: %d개 삭제", removed)


def _cleanup_loop() -> None:
    while not _stop.wait(CLEANUP_INTERVAL_SEC):
        try:
            cleanup_once()
        except Exception:  # noqa: BLE001
            log.exception("정리 실패")


def start() -> None:
    """프로그램을 켤 때 한 번."""
    global _cleanup_thread
    for d in (config.TRACKS_DIR, config.EXPORTS_DIR, config.META_DIR):
        d.mkdir(parents=True, exist_ok=True)
    failed = store.fail_unfinished()
    if failed:
        log.info("지난번에 끝나지 않은 작업 %d개를 실패로 표시", failed)
    cleanup_once()
    _stop.clear()
    if _cleanup_thread is None or not _cleanup_thread.is_alive():
        _cleanup_thread = threading.Thread(target=_cleanup_loop, name="easymusic-cleanup", daemon=True)
        _cleanup_thread.start()


def stop() -> None:
    """프로그램을 끌 때. 줄 서 있던 작업은 버림 (다음에 켜면 failed INTERNAL)."""
    _stop.set()
    for pool in _pools.values():
        pool.shutdown(wait=False, cancel_futures=True)
    _pools.clear()


def busy() -> bool:
    """불러오거나 만드는 중인 작업이 있는지 (창 닫기 확인, 결정 74)."""
    with _active_lock:
        return _active > 0
