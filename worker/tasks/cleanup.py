"""24시간 지난 추출 · 결과 파일 삭제 (PLAN 12장, beat로 30분마다).

작업 · 노래 · 내보내기 기록은 Redis 키 TTL(24시간)로 따로 사라진다.
"""
from __future__ import annotations

import logging
import shutil
import time

from app import config

log = logging.getLogger(__name__)


def run_cleanup(now: float | None = None) -> int:
    now = time.time() if now is None else now
    cutoff = now - config.FILE_TTL_SEC
    removed = 0
    for folder in (config.TRACKS_DIR, config.EXPORTS_DIR):
        if not folder.is_dir():
            continue
        for p in folder.iterdir():
            try:
                if p.stat().st_mtime >= cutoff:
                    continue
                if p.is_dir() and not p.is_symlink():
                    shutil.rmtree(p, ignore_errors=True)  # 남은 *.work 폴더
                else:
                    p.unlink(missing_ok=True)
                removed += 1
            except FileNotFoundError:
                continue
    if removed:
        log.info("cleanup: %d개 삭제", removed)
    return removed
