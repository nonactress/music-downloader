"""모든 API 로그인 필요 + 내 것만 (결정 57, CONTRACT v1.6)."""
import pytest

from app import config, store
from app.main import app
from tests.conftest import OWNER, login_client

PUBLIC = {("GET", "/health"), ("POST", "/auth/login"), ("POST", "/auth/logout")}


def _all_routes():
    """앱의 모든 API (OpenAPI 스키마 기준 — 포함된 라우터까지)."""
    for path, ops in app.openapi()["paths"].items():
        for method in ops:
            yield method.upper(), path


def test_route_list_is_what_we_expect():
    paths = set(_all_routes())
    assert PUBLIC <= paths
    assert {("POST", "/tracks"), ("GET", "/jobs/{job_id}"), ("GET", "/tracks/{track_id}/audio"),
            ("GET", "/tracks/{track_id}/peaks"), ("POST", "/exports"),
            ("GET", "/exports/{export_id}/download"), ("GET", "/auth/me")} <= paths


@pytest.mark.parametrize("method,path", sorted(set(_all_routes()) - PUBLIC))
def test_every_api_requires_login(anon, method, path):
    """새 API를 추가해도 자동으로 검사된다."""
    url = path.replace("{job_id}", "j_x").replace("{track_id}", "t_x").replace("{export_id}", "e_x")
    res = anon.request(method, url, json={})
    assert res.status_code == 401, (method, path, res.text)
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_public_routes_without_login(anon):
    assert anon.get("/health").status_code == 200
    assert anon.post("/auth/logout").status_code == 204
    assert anon.post("/auth/login", json={"loginId": "x", "password": "y"}).status_code == 401


def test_unauthorized_before_rate_limit(anon, monkeypatch):
    """로그인 안 한 요청은 요청 수 제한 · 하루 한도를 쓰지 않는다."""
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 1)
    for _ in range(3):
        assert anon.post("/tracks", json={"url": "https://youtu.be/dQw4w9WgXcQ"}).status_code == 401


# ---- 남의 것은 404 ------------------------------------------------------------

def _done_track(owner):
    job = store.create_job("extract", owner=owner)
    t = store.create_track(job["jobId"], "u", owner=owner)
    store.update_track(t["trackId"], status="done", durationSec=100.0)
    config.TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    config.track_audio_path(t["trackId"]).write_bytes(b"x" * 100)
    config.track_peaks_path(t["trackId"]).write_text('{"peaks":[]}')
    return job["jobId"], t["trackId"]


def _done_export(owner):
    job = store.create_job("export", owner=owner)
    exp = store.create_export(job["jobId"], owner=owner)
    config.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    config.export_path(exp["exportId"]).write_bytes(b"mp3")
    store.update_export(exp["exportId"], status="done", fileName="내 노래_1012.mp3")
    return job["jobId"], exp["exportId"]


@pytest.fixture
def other(sent):
    return login_client("198.51.100.50", "neighbor")


def test_other_users_records_are_404(client, other):
    job_id, track_id = _done_track(OWNER)
    ejob_id, export_id = _done_export(OWNER)
    for url in (f"/jobs/{job_id}", f"/jobs/{ejob_id}", f"/tracks/{track_id}/audio",
                f"/tracks/{track_id}/peaks", f"/exports/{export_id}/download"):
        assert client.get(url).status_code == 200, url          # 만든 사람은 됨
        res = other.get(url)
        assert res.status_code == 404, url                      # 남은 404 (있는지도 모르게)
        assert res.json()["error"]["code"] == "NOT_FOUND"


def test_other_users_source_in_edit_is_404(client, other, sent):
    _, track_id = _done_track(OWNER)
    edit = {"tracks": [{"sourceId": track_id, "start": 0, "end": 50, "speed": 1, "keepPitch": True}],
            "crossfade": 0, "normalize": False, "format": "mp3"}
    res = other.post("/exports", json=edit)
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"
    assert client.post("/exports", json=edit).status_code == 202
    # 내 것 + 남의 것 섞어도 404
    _, mine = _done_track("neighbor")
    edit["tracks"].insert(0, {**edit["tracks"][0], "sourceId": mine})
    assert other.post("/exports", json=edit).status_code == 404


def test_created_records_have_owner(client, sent):
    body = client.post("/tracks", json={"url": "https://youtu.be/dQw4w9WgXcQ"}).json()
    assert store.get_job(body["jobId"])["owner"] == OWNER
    assert store.get_track(body["trackId"])["owner"] == OWNER
    assert "owner" not in client.get(f"/jobs/{body['jobId']}").json()


def test_records_without_owner_are_404(client):
    """로그인 기능 전에 만든 기록(주인 없음)은 아무도 못 봄."""
    job = store.create_job("extract")
    assert client.get(f"/jobs/{job['jobId']}").status_code == 404


def test_audio_and_download_work_with_cookie_only(client):
    """<audio src> · 다운로드 링크는 쿠키만으로 통과 (CONTRACT 5-1)."""
    _, track_id = _done_track(OWNER)
    _, export_id = _done_export(OWNER)
    res = client.get(f"/tracks/{track_id}/audio", headers={"Range": "bytes=0-9"})
    assert res.status_code == 206
    assert client.get(f"/exports/{export_id}/download").status_code == 200
