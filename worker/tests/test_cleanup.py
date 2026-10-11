import os
import time

from app import config, queue
from worker.celery_app import celery_app
from worker.tasks.cleanup import run_cleanup


def _touch(path, age_hours):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".work":
        path.mkdir()
    else:
        path.write_bytes(b"x")
    t = time.time() - age_hours * 3600
    os.utime(path, (t, t))
    return path


def test_cleanup_removes_only_old_files():
    old = [
        _touch(config.TRACKS_DIR / "t_old.mp3", 25),
        _touch(config.TRACKS_DIR / "t_old.peaks.json", 25),
        _touch(config.TRACKS_DIR / "t_old2.work", 30),
        _touch(config.EXPORTS_DIR / "e_old.mp3", 24.1),
    ]
    new = [
        _touch(config.TRACKS_DIR / "t_new.mp3", 1),
        _touch(config.EXPORTS_DIR / "e_new.mp3", 23.9),
    ]
    assert run_cleanup() == 4
    assert not any(p.exists() for p in old)
    assert all(p.exists() for p in new)


def test_cleanup_no_dirs():
    assert run_cleanup() == 0


def test_beat_schedule():
    entry = celery_app.conf.beat_schedule["cleanup-old-files"]
    assert entry["task"] == queue.CLEANUP_TASK
    assert entry["schedule"] <= 3600
