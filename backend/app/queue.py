"""Celery 작업 등록. API는 worker 코드를 import하지 않고 이름으로만 보낸다."""
from __future__ import annotations

from celery import Celery

from . import config

EXTRACT_TASK = "extract_track"
EXPORT_TASK = "render_export"
CLEANUP_TASK = "cleanup_files"

_celery: Celery | None = None


def get_celery() -> Celery:
    global _celery
    if _celery is None:
        _celery = Celery("api", broker=config.REDIS_URL)
    return _celery


def send(task_name: str, *args) -> None:
    get_celery().send_task(task_name, args=list(args))
