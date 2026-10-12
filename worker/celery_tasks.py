"""서버 모드 Celery 작업 등록 (데스크톱은 이 파일을 쓰지 않음 — app/desktop_runtime.py).

작업 함수 본체는 worker/tasks/*.py의 run_*이고, 여기서는 이름 · 시간 제한만 붙인다.
"""
from app import config, queue
from worker.celery_app import celery_app
from worker.tasks.cleanup import run_cleanup
from worker.tasks.export import run_export
from worker.tasks.extract import run_extract


@celery_app.task(
    name=queue.EXTRACT_TASK,
    soft_time_limit=config.EXTRACT_TIMEOUT_SEC,
    time_limit=config.EXTRACT_TIMEOUT_SEC + 30,
)
def extract_track(job_id: str, track_id: str) -> None:
    run_extract(job_id, track_id)


@celery_app.task(
    name=queue.EXPORT_TASK,
    soft_time_limit=config.EXPORT_TIMEOUT_SEC,
    time_limit=config.EXPORT_TIMEOUT_SEC + 30,
)
def render_export(job_id: str, export_id: str, edit: dict) -> None:
    run_export(job_id, export_id, edit)


@celery_app.task(name=queue.CLEANUP_TASK, soft_time_limit=300, time_limit=330)
def cleanup_files() -> int:
    return run_cleanup()
