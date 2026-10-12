"""Celery 앱 (작업자 + beat)."""
import logging

from celery import Celery
from celery.signals import worker_ready

from app import config, queue

celery_app = Celery(
    "worker",
    broker=config.REDIS_URL,
    include=["worker.celery_tasks"],
)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_ignore_result=True,
    broker_connection_retry_on_startup=True,
    timezone=config.TIMEZONE,
)

# 24시간 지난 파일 삭제 (PLAN 12장). Redis 기록은 키 TTL로 함께 사라진다.
celery_app.conf.beat_schedule = {
    "cleanup-old-files": {"task": queue.CLEANUP_TASK, "schedule": 30 * 60},
}


@worker_ready.connect
def _log_versions(**_):
    """yt-dlp 고장 신고가 오면 로그에서 버전부터 확인 (README "yt-dlp가 고장 나면")."""
    import yt_dlp

    logging.getLogger(__name__).info("yt-dlp %s", yt_dlp.version.__version__)
