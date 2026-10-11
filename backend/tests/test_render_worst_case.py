"""B10 최악 경우 렌더링 측정 (PLAN 12장 작업 타임아웃).

20분 × 20곡 + crossfade 2초 + normalize를 render_export와 같은 코드(run_export)로 렌더링하고
걸린 시간 · 결과 크기 · 디스크 사용량 · ffmpeg 메모리를 잰다.

    cd backend && ../.venv/bin/pytest -m slow -s tests/test_render_worst_case.py

작게 돌리기: WORST_TRACKS=4 WORST_MINUTES=5 ../.venv/bin/pytest -m slow -s ...
"""
import os
import resource
import shutil
import subprocess
import sys
import threading
import time

import pytest

from app import config, store
from app.ffmpeg_builder import TrackEdit, total_duration

pytestmark = [
    pytest.mark.slow,
    pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg 없음"),
]

TRACKS = int(os.environ.get("WORST_TRACKS", "20"))
MINUTES = float(os.environ.get("WORST_MINUTES", "20"))
CROSSFADE = 2


def _dir_size(path) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except FileNotFoundError:
                pass
    return total


def _make_source(path, seconds):
    """44.1kHz 스테레오 mp3 (추출 결과와 같은 형식). 사인파 + 핑크 노이즈 + 음량 변화."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y",
         "-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=44100:duration={seconds}",
         "-f", "lavfi", "-i", f"anoisesrc=color=pink:sample_rate=44100:duration={seconds}:amplitude=0.3",
         "-filter_complex", "[0][1]amix=inputs=2,volume='0.5+0.4*sin(t/7)':eval=frame",
         "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", str(path)],
        check=True,
    )


def test_worst_case_render():
    from worker import media
    from worker.tasks import export

    seconds = MINUTES * 60
    config.TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    first = config.track_audio_path("t_src0")
    _make_source(first, seconds)
    ids = []
    for i in range(TRACKS):
        tid = f"t_src{i}"
        if i:
            shutil.copyfile(first, config.track_audio_path(tid))  # 곡마다 다른 파일
        ids.append(tid)
    source_bytes = _dir_size(config.TRACKS_DIR)

    tracks = [TrackEdit(0, seconds, 1.0, True) for _ in ids]
    edit = {
        "tracks": [{"sourceId": t, "start": 0, "end": seconds, "speed": 1.0, "keepPitch": True} for t in ids],
        "crossfade": CROSSFADE, "normalize": True, "format": "mp3",
    }
    job = store.create_job("export")
    exp = store.create_export(job["jobId"])

    peak = {"disk": 0}
    stop = threading.Event()

    def sample():
        while not stop.is_set():
            peak["disk"] = max(peak["disk"], _dir_size(config.DATA_DIR))
            time.sleep(0.5)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    rss_before = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    started = time.monotonic()
    export.run_export(job["jobId"], exp["exportId"], edit)
    elapsed = time.monotonic() - started
    stop.set()
    sampler.join()
    rss = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    rss_mb = (rss if rss > rss_before else rss_before) / (1e6 if sys.platform == "darwin" else 1e3)

    result = store.get_job(job["jobId"])
    assert result["status"] == "done", result["error"]
    r = result["result"]
    expected = total_duration(tracks, CROSSFADE)
    audio_min = expected / 60

    print(
        f"\n[B10] {TRACKS}곡 × {MINUTES:g}분, crossfade {CROSSFADE}초, normalize"
        f"\n  렌더 시간      {elapsed:8.1f}초  (결과 {audio_min:.1f}분 → 실시간의 {expected / elapsed:.1f}배)"
        f"\n  타임아웃       {config.EXPORT_TIMEOUT_SEC}초  → 여유 {config.EXPORT_TIMEOUT_SEC - elapsed:+.0f}초"
        f"\n  결과 길이      {r['durationSec']:.2f}초 (예상 {expected:.2f})"
        f"\n  결과 크기      {r['sizeBytes'] / 1e6:8.1f}MB"
        f"\n  원곡 합계      {source_bytes / 1e6:8.1f}MB"
        f"\n  디스크 최대    {peak['disk'] / 1e6:8.1f}MB (원곡 + 임시 + 결과)"
        f"\n  ffmpeg 최대 메모리 {rss_mb:6.0f}MB (자식 프로세스 최대, 근사)"
    )
    assert r["durationSec"] == pytest.approx(expected, abs=1.0)
    assert elapsed < config.EXPORT_TIMEOUT_SEC, f"{elapsed:.0f}초 > 타임아웃 {config.EXPORT_TIMEOUT_SEC}초"
