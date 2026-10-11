"""Celery 앱 (작업자 + beat)."""
from celery import Celery

from app import config

celery_app = Celery("worker", broker=config.REDIS_URL, include=["worker.tasks.extract"])
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_ignore_result=True,
    broker_connection_retry_on_startup=True,
    timezone=config.TIMEZONE,
)
