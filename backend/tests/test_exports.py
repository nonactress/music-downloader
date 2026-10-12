from urllib.parse import quote

import pytest

from app import config, queue, store
from tests.conftest import OWNER


def _ready_track(duration=200.0, status="done", with_file=True, owner=OWNER):
    job = store.create_job("extract", owner=owner)
    t = store.create_track(job["jobId"], "https://www.youtube.com/watch?v=dQw4w9WgXcQ", owner=owner)
    store.update_track(t["trackId"], status=status, durationSec=duration)
    if with_file:
        config.TRACKS_DIR.mkdir(parents=True, exist_ok=True)
        config.track_audio_path(t["trackId"]).write_bytes(b"mp3")
    return t["trackId"]


def _edit(*tracks, crossfade=2, normalize=True, fmt="mp3"):
    return {"tracks": list(tracks), "crossfade": crossfade, "normalize": normalize, "format": fmt}


def _t(sid, start=0, end=100, speed=1.0, keep=True):
    return {"sourceId": sid, "start": start, "end": end, "speed": speed, "keepPitch": keep}


def test_create_export(client, sent):
    a, b = _ready_track(), _ready_track(240)
    edit = _edit(_t(a, 12.5, 200), _t(b, 0, 240, 1.25))
    res = client.post("/exports", json={**edit, "extra": "무시"})
    assert res.status_code == 202
    body = res.json()
    assert set(body) == {"jobId", "exportId"}
    job = store.get_job(body["jobId"])
    assert job["kind"] == "export" and job["status"] == "queued" and job["track"] is None
    assert sent == [(queue.EXPORT_TASK, body["jobId"], body["exportId"], edit)]


@pytest.mark.parametrize("mutate", [
    lambda e: e.update(tracks=[]),
    lambda e: e.pop("tracks"),
    lambda e: e.update(format="wav"),
    lambda e: e.update(crossfade=-1),
    lambda e: e.update(crossfade=10.5),
    lambda e: e.update(normalize="yes please"),
    lambda e: e["tracks"][0].update(speed=0.4),
    lambda e: e["tracks"][0].update(speed=2.1),
    lambda e: e["tracks"][0].update(start=-1),
    lambda e: e["tracks"][0].update(start=50, end=50),
    lambda e: e["tracks"][0].update(start=60, end=50),
    lambda e: e["tracks"][0].update(start=10, end=10.9),       # 최소 1초
    lambda e: e["tracks"][0].update(end=200.06),               # 원곡보다 김
    lambda e: e["tracks"][0].pop("keepPitch"),
    lambda e: e.update(tracks=[_t(e["tracks"][0]["sourceId"], 0, 100),
                               _t(e["tracks"][0]["sourceId"], 0, 3, 1.5)]),  # 결과 2초 ≤ crossfade 2초
])
def test_invalid_edit(client, sent, mutate):
    edit = _edit(_t(_ready_track(200.0)))
    mutate(edit)
    res = client.post("/exports", json=edit)
    assert res.status_code == 422, res.json()
    err = res.json()["error"]
    assert err["code"] == "INVALID_EDIT"
    assert err["message"] == "편집 내용에 문제가 있어요. 다시 확인해 주세요."
    assert sent == []


def test_end_within_tolerance_ok(client):
    sid = _ready_track(200.0)
    assert client.post("/exports", json=_edit(_t(sid, 0, 200.04))).status_code == 202


def test_single_track_ignores_crossfade_length(client):
    sid = _ready_track(200.0)
    assert client.post("/exports", json=_edit(_t(sid, 0, 1.5), crossfade=10)).status_code == 202


def test_source_missing(client):
    res = client.post("/exports", json=_edit(_t("t_nope")))
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"


def test_source_extract_failed_is_404(client):
    """CONTRACT v1.3: 추출이 실패한 sourceId → 404 NOT_FOUND."""
    res = client.post("/exports", json=_edit(_t(_ready_track(status="failed", with_file=False))))
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"


def test_source_file_deleted(client):
    res = client.post("/exports", json=_edit(_t(_ready_track(with_file=False))))
    assert res.status_code == 404


@pytest.mark.parametrize("status", ["queued", "running"])
def test_source_not_ready(client, status):
    res = client.post("/exports", json=_edit(_t(_ready_track(status=status, with_file=False))))
    assert res.status_code == 409 and res.json()["error"]["code"] == "NOT_READY"


def _done_export(data=b"0123456789" * 100, owner=OWNER):
    job = store.create_job("export", owner=owner)
    exp = store.create_export(job["jobId"], owner=owner)
    config.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    config.export_path(exp["exportId"]).write_bytes(data)
    store.update_export(exp["exportId"], status="done", fileName="내 노래_1011.mp3")
    return exp["exportId"]


def test_download(client):
    eid = _done_export()
    res = client.get(f"/exports/{eid}/download")
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/mpeg"
    assert res.headers["accept-ranges"] == "bytes"
    assert res.headers["content-disposition"] == (
        "attachment; filename=\"export.mp3\"; filename*=UTF-8''"
        + "%EB%82%B4%20%EB%85%B8%EB%9E%98_1011.mp3"
    )
    assert quote("내 노래_1011.mp3") in res.headers["content-disposition"]
    assert len(res.content) == 1000


def test_download_range(client):
    eid = _done_export()
    res = client.get(f"/exports/{eid}/download", headers={"Range": "bytes=10-19"})
    assert res.status_code == 206
    assert res.content == b"0123456789"
    assert res.headers["content-range"] == "bytes 10-19/1000"


def test_download_not_ready(client):
    job = store.create_job("export", owner=OWNER)
    exp = store.create_export(job["jobId"], owner=OWNER)
    res = client.get(f"/exports/{exp['exportId']}/download")
    assert res.status_code == 409 and res.json()["error"]["code"] == "NOT_READY"


def test_download_missing(client):
    assert client.get("/exports/e_nope/download").status_code == 404
    eid = _done_export()
    config.export_path(eid).unlink()
    assert client.get(f"/exports/{eid}/download").status_code == 404


def test_twenty_tracks_ok_twenty_one_rejected(client):
    sid = _ready_track(200.0)
    assert client.post("/exports", json=_edit(*[_t(sid)] * 20)).status_code == 202
    res = client.post("/exports", json=_edit(*[_t(sid)] * 21))
    assert res.status_code == 422 and res.json()["error"]["code"] == "INVALID_EDIT"


def test_download_render_failed_is_404(client):
    """CONTRACT v1.3: 렌더링이 실패한 내보내기 → 404 NOT_FOUND (409 아님)."""
    job = store.create_job("export", owner=OWNER)
    exp = store.create_export(job["jobId"], owner=OWNER)
    store.update_export(exp["exportId"], status="failed")
    res = client.get(f"/exports/{exp['exportId']}/download")
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"
