"""Celery 작업 등록. API는 worker 코드를 import하지 않고 이름으로만 보낸다."""
from __future__ import annotations

from typing import TYPE_CHECKING

from . import config

if TYPE_CHECKING:
    from celery import Celery

EXTRACT_TASK = "extract_track"
EXPORT_TASK = "render_export"
CLEANUP_TASK = "cleanup_files"

_celery: "Celery | None" = None


def get_celery() -> "Celery":
    """서버 모드에서만 부른다. 데스크톱 프로그램에는 Celery가 없다 (B33)."""
    global _celery
    if _celery is None:
        from celery import Celery
        _celery = Celery("api", broker=config.REDIS_URL)
    return _celery


def send(task_name: str, *args) -> None:
    if config.DESKTOP:  # 데스크톱: 같은 프로세스 안 스레드 작업자 (결정 66)
        from . import desktop_runtime
        desktop_runtime.submit(task_name, *args)
        return
    get_celery().send_task(task_name, args=list(args))
