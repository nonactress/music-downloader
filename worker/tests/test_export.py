from datetime import datetime

import pytest

from app import config, store
from worker import media
from worker.tasks import export
from worker.tests.conftest import make_tone, needs_ffmpeg


def _source(tmp_path, seconds, freq=440):
    job = store.create_job("extract")
    t = store.create_track(job["jobId"], "u")
    config.TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    wav = make_tone(tmp_path / f"{t['trackId']}.wav", seconds, freq)
    media.convert_to_mp3(wav, config.track_audio_path(t["trackId"]))
    store.update_track(t["trackId"], status="done", durationSec=media.probe_duration(
        config.track_audio_path(t["trackId"])))
    return t["trackId"]


def _new_export():
    job = store.create_job("export")
    exp = store.create_export(job["jobId"])
    return job["jobId"], exp["exportId"]


@needs_ffmpeg
@pytest.mark.parametrize("crossfade,normalize,expected", [
    (1, True, (4 - 1) + (6 / 1.5) - 1),   # 3 + 4 - 1 = 6
    (0, False, 3 + 4),
])
def test_export_render(tmp_path, crossfade, normalize, expected):
    a = _source(tmp_path, 5, 440)
    b = _source(tmp_path, 7, 660)
    edit = {
        "tracks": [
            {"sourceId": a, "start": 1, "end": 4, "speed": 1.0, "keepPitch": True},
            {"sourceId": b, "start": 0, "end": 6, "speed": 1.5, "keepPitch": False},
        ],
        "crossfade": crossfade, "normalize": normalize, "format": "mp3",
    }
    job_id, export_id = _new_export()
    export.run_export(job_id, export_id, edit)

    job = store.get_job(job_id)
    assert job["status"] == "done", job["error"]
    assert job["progress"] == 100
    r = job["result"]
    assert set(r) == {"exportId", "fileName", "trackCount", "durationSec", "sizeBytes"}
    assert r["exportId"] == export_id and r["trackCount"] == 2
    assert r["durationSec"] == pytest.approx(expected, abs=0.15)
    out = config.export_path(export_id)
    assert out.exists() and r["sizeBytes"] == out.stat().st_size
    assert store.get_export(export_id)["status"] == "done"
    # 임시 파일 정리
    assert sorted(p.name for p in config.EXPORTS_DIR.iterdir()) == [out.name]


def test_export_missing_source(tmp_path):
    edit = {"tracks": [{"sourceId": "t_gone", "start": 0, "end": 3, "speed": 1, "keepPitch": True}],
            "crossfade": 0, "normalize": False, "format": "mp3"}
    job_id, export_id = _new_export()
    export.run_export(job_id, export_id, edit)
    job = store.get_job(job_id)
    assert job["status"] == "failed"
    assert job["error"] == {"code": "EXPORT_FAILED", "message": "노래를 만들지 못했어요. 잠시 후 다시 시도해 주세요."}
    assert store.get_export(export_id)["status"] == "failed"


def test_export_timeout(tmp_path, monkeypatch):
    from celery.exceptions import SoftTimeLimitExceeded

    config.TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    config.track_audio_path("t_a").write_bytes(b"x")

    def boom(*a, **k):
        raise SoftTimeLimitExceeded()
    monkeypatch.setattr(export, "_render", boom)
    edit = {"tracks": [{"sourceId": "t_a", "start": 0, "end": 3, "speed": 1, "keepPitch": True}],
            "crossfade": 0, "normalize": False, "format": "mp3"}
    job_id, export_id = _new_export()
    export.run_export(job_id, export_id, edit)
    assert store.get_job(job_id)["error"]["code"] == "TIMEOUT"


def test_file_name_uses_month_day():
    assert export.file_name(datetime(2026, 1, 5, 9, 0)) == "내 노래_0105.mp3"
    assert export.file_name(datetime(2026, 10, 11)) == "내 노래_1011.mp3"


def test_parse_out_time():
    assert export._parse_out_time("out_time_us=2500000\n") == 2.5
    assert export._parse_out_time("out_time_ms=1000000") == 1.0
    assert export._parse_out_time("out_time_us=N/A") is None
    assert export._parse_out_time("progress=continue") is None
