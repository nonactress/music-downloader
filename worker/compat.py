"""Celery 없이도 돌게 (데스크톱 프로그램에는 Celery를 넣지 않음, B33).

서버 모드: Celery의 작업 시간 초과 예외 그대로. 데스크톱: 같은 이름의 빈 예외 (일어날 일이 없음 —
데스크톱은 subprocess 자체 타임아웃으로 TIMEOUT을 낸다).
"""
try:
    from celery.exceptions import SoftTimeLimitExceeded
except ImportError:  # pragma: no cover — 데스크톱 묶음
    class SoftTimeLimitExceeded(Exception):
        pass

__all__ = ["SoftTimeLimitExceeded"]
