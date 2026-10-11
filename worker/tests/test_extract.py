import json
import shutil

import numpy as np
import pytest
import yt_dlp

from app import config, store
from worker import media
from worker.tasks import extract
from worker.tests.conftest import make_tone, needs_ffmpeg


class FakeYDL:
    """yt_dlp.YoutubeDL 대역: 정보와 '다운로드'(사인파 파일 복사)를 흉내낸다."""
    info = {}
    source = None          # 다운로드할 파일
    extract_error = None   # extract_info에서 던질 예외

    def __init__(self, opts):
        self.opts = opts
        assert opts["noplaylist"] is True

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def extract_info(self, url, download=False):
        assert url.startswith("https://www.youtube.com/watch?v=")
        assert download is False
        if FakeYDL.extract_error:
            raise FakeYDL.extract_error
        return dict(FakeYDL.info)

    def process_ie_result(self, info, download=True):
        out = self.opts["outtmpl"].replace("%(ext)s", "webm")
        for hook in self.opts.get("progress_hooks", []):
            hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100, "eta": 3})
        shutil.copy(FakeYDL.source, out)
        return info


@pytest.fixture
def fake_ydl(monkeypatch):
    FakeYDL.info = {"title": "테스트 노래", "channel": "채널", "duration": 3,
                    "thumbnail": "https://i.ytimg.com/vi/x/hqdefault.jpg"}
    FakeYDL.extract_error = None
    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeYDL)
    return FakeYDL


def _new():
    job = store.create_job("extract")
    track = store.create_track(job["jobId"], "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    return job["jobId"], track["trackId"]


@needs_ffmpeg
def test_extract_success(fake_ydl, tmp_path):
    fake_ydl.source = make_tone(tmp_path / "src.wav", 3)
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)

    job = store.get_job(job_id)
    assert job["status"] == "done" and job["progress"] == 100 and job["error"] is None
    t = job["result"]["track"]
    assert t["trackId"] == track_id and t["title"] == "테스트 노래" and t["channel"] == "채널"
    assert t["durationSec"] == pytest.approx(3, abs=0.1)
    assert job["track"] == t

    audio = config.track_audio_path(track_id)
    assert audio.exists()
    assert media.probe_duration(audio) == t["durationSec"]
    # 44.1kHz 스테레오
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                          "-show_entries", "stream=sample_rate,channels", "-of", "json", str(audio)],
                         capture_output=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    assert s["sample_rate"] == "44100" and s["channels"] == 2

    peaks = json.loads(config.track_peaks_path(track_id).read_text())
    assert peaks["trackId"] == track_id and peaks["pointsPerSecond"] == 20
    assert peaks["durationSec"] == t["durationSec"]
    assert len(peaks["peaks"]) == int(np.ceil(t["durationSec"] * 20))
    assert all(0 <= p <= 1 for p in peaks["peaks"])
    assert max(peaks["peaks"]) > 0.05

    assert store.get_track(track_id)["status"] == "done"
    assert not (config.TRACKS_DIR / f"{track_id}.work").exists()


def test_extract_too_long(fake_ydl):
    fake_ydl.info["duration"] = 20 * 60 + 1
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    job = store.get_job(job_id)
    assert job["status"] == "failed"
    assert job["error"] == {"code": "TOO_LONG", "message": "20분이 넘는 영상은 가져올 수 없어요."}
    assert store.get_track(track_id)["status"] == "failed"


def test_extract_live_rejected(fake_ydl):
    fake_ydl.info["is_live"] = True
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    assert store.get_job(job_id)["error"]["code"] == "VIDEO_UNAVAILABLE"


@pytest.mark.parametrize("msg,code", [
    ("ERROR: [youtube] x: Video unavailable", "VIDEO_UNAVAILABLE"),
    ("ERROR: [youtube] x: Private video. Sign in if you've been granted access", "VIDEO_UNAVAILABLE"),
    ("ERROR: [youtube] x: Sign in to confirm you're not a bot", "EXTRACT_FAILED"),
    ("ERROR: Unable to download webpage: timed out", "EXTRACT_FAILED"),
])
def test_extract_download_errors(fake_ydl, msg, code):
    fake_ydl.extract_error = yt_dlp.utils.DownloadError(msg)
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    job = store.get_job(job_id)
    assert job["status"] == "failed" and job["error"]["code"] == code


def test_extract_timeout(fake_ydl, monkeypatch):
    from celery.exceptions import SoftTimeLimitExceeded

    def boom(*a, **k):
        raise SoftTimeLimitExceeded()
    monkeypatch.setattr(FakeYDL, "process_ie_result", boom)
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    job = store.get_job(job_id)
    assert job["error"]["code"] == "TIMEOUT"
    assert job["track"]["title"] == "테스트 노래"  # 정보는 먼저 채워져 있었음


def test_progress_hook_monotonic_and_eta():
    job_id, _ = _new()
    store.update_job(job_id, status="running")
    hook = extract._ProgressHook(job_id, 100)
    hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100, "eta": 4})
    job = store.get_job(job_id)
    assert job["progress"] == 5 + 37
    assert job["etaSeconds"] == 4 + 3
    hook.last_write = 0
    hook({"status": "downloading", "downloaded_bytes": 10, "total_bytes": 100, "eta": None})
    job = store.get_job(job_id)
    assert job["progress"] == 42  # 줄어들지 않음
    assert job["etaSeconds"] is None


def test_peaks_from_samples_length_and_range():
    rate = 8000
    samples = np.zeros(int(rate * 2.5), dtype=np.int16)
    samples[100] = -32768
    samples[rate] = 16384
    peaks = media.peaks_from_samples(samples, rate, 2.5, 20)
    assert len(peaks) == 50
    assert peaks[0] == 1.0
    assert peaks[20] == 0.5
    assert peaks[-1] == 0.0


@pytest.mark.parametrize("step", ["extract_info", "process_ie_result"])
def test_extract_timeout_wrapped_in_download_error(fake_ydl, monkeypatch, step):
    """yt-dlp가 SoftTimeLimitExceeded를 DownloadError로 감싸도 TIMEOUT."""
    import sys
    from celery.exceptions import SoftTimeLimitExceeded

    def wrapped(*a, **k):
        try:
            raise SoftTimeLimitExceeded()
        except SoftTimeLimitExceeded:
            raise yt_dlp.utils.DownloadError("ERROR: SoftTimeLimitExceeded()", sys.exc_info())
    monkeypatch.setattr(FakeYDL, step, wrapped)
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    assert store.get_job(job_id)["error"]["code"] == "TIMEOUT"
