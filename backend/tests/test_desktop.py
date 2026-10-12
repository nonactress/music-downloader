"""데스크톱 모드 (CONTRACT 7장, 결정 65~69). 서버 모드 테스트는 그대로 따로 돈다."""
import json
import time

import pytest
from fastapi.testclient import TestClient

from app import config, desktop_runtime, queue, store
from app.main import create_app

PORT = 47821
BASE = f"http://127.0.0.1:{PORT}"
KEY = "launch-key-123"


@pytest.fixture
def dist(tmp_path):
    d = tmp_path / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html><title>쉬운 음악 만들기</title>", encoding="utf-8")
    (d / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("outside", encoding="utf-8")
    return d


@pytest.fixture
def desktop(monkeypatch, dist, sent):
    monkeypatch.setattr(config, "DESKTOP", True)
    monkeypatch.setattr(config, "DESKTOP_KEY", KEY)
    monkeypatch.setattr(config, "DESKTOP_PORT", PORT)
    monkeypatch.setattr(config, "FRONTEND_DIST", dist)
    return create_app(desktop=True, api_docs=False)


def _client(app, base=BASE):
    return TestClient(app, base_url=base, raise_server_exceptions=False)


@pytest.fixture
def started(desktop):
    c = _client(desktop)
    res = c.get(f"/desktop/start?key={KEY}", follow_redirects=False)
    assert res.status_code == 302
    return c


# ---- 열쇠 · 세션 · Host --------------------------------------------------------

def test_start_sets_strict_cookie_and_redirects(desktop):
    res = _client(desktop).get(f"/desktop/start?key={KEY}", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"] == "/"
    cookie = res.headers["set-cookie"].lower()
    assert cookie.startswith("em_session=") and "httponly" in cookie and "samesite=strict" in cookie
    assert "max-age" not in cookie   # 이번 실행 동안만


@pytest.mark.parametrize("query", ["", "?key=", "?key=wrong", f"?key={KEY}x"])
def test_start_wrong_key_403(desktop, query):
    res = _client(desktop).get(f"/desktop/start{query}", follow_redirects=False)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "UNAUTHORIZED"
    assert "set-cookie" not in res.headers


def test_start_without_configured_key_403(desktop, monkeypatch):
    monkeypatch.setattr(config, "DESKTOP_KEY", "")
    assert _client(desktop).get("/desktop/start?key=", follow_redirects=False).status_code == 403


@pytest.mark.parametrize("base", ["http://localhost:47821", "http://evil.example:47821",
                                  "http://127.0.0.1:47822", "http://127.0.0.1"])
def test_wrong_host_403_everywhere(started, desktop, base):
    """DNS 리바인딩 · 다른 주소로 붙는 것 막기 — API · 화면 · 시작 주소 모두."""
    c = _client(desktop, base)
    c.cookies = started.cookies
    for path in ("/api/auth/me", "/", "/assets/app.js", f"/desktop/start?key={KEY}", "/api/health"):
        res = c.get(path, follow_redirects=False)
        assert res.status_code == 403, (base, path)
        assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_desktop(desktop, started):
    assert _client(desktop).get("/api/auth/me").status_code == 401   # 쿠키 없으면 401
    assert started.get("/api/auth/me").json() == {"user": {"loginId": "me"}, "desktop": True}


def test_login_logout_not_in_desktop(started):
    assert started.post("/api/auth/login", json={"loginId": "a", "password": "b"}).status_code == 404
    assert started.post("/api/auth/logout").status_code == 404


def test_every_api_needs_desktop_session(desktop):
    c = _client(desktop)
    for method, path in [("POST", "/api/tracks"), ("GET", "/api/jobs/j_x"), ("GET", "/api/tracks/t_x/audio"),
                         ("GET", "/api/tracks/t_x/peaks"), ("POST", "/api/exports"),
                         ("GET", "/api/exports/e_x/download"), ("GET", "/api/auth/me")]:
        assert c.request(method, path, json={}).status_code == 401, path
    assert c.get("/api/health").json() == {"ok": True}


def test_cookie_from_other_run_rejected(desktop):
    c = _client(desktop)
    c.cookies.set("em_session", "old-run-token")
    assert c.get("/api/auth/me").status_code == 401


# ---- 화면 파일 ----------------------------------------------------------------

def test_frontend_served(started):
    res = started.get("/")
    assert res.status_code == 200 and "쉬운 음악 만들기" in res.text
    assert res.headers["cache-control"] == "no-cache"
    assert started.get("/assets/app.js").text == "console.log(1)"
    assert "쉬운 음악 만들기" in started.get("/some/screen").text      # 한 페이지 앱 → index.html


def test_frontend_no_traversal(started):
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"):
        assert "outside" not in started.get(path).text


def test_unknown_api_is_json_404(started):
    res = started.get("/api/nope")
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"


def test_docs_off_in_desktop(started):
    assert started.get("/api/docs").status_code == 404
    assert started.get("/api/openapi.json").status_code == 404


# ---- API 동작 -----------------------------------------------------------------

def test_tracks_flow_uses_files_not_redis(started, sent, fake_redis):
    res = started.post("/api/tracks", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    assert res.status_code == 202
    body = res.json()
    assert sent == [(queue.EXTRACT_TASK, body["jobId"], body["trackId"])]
    assert list(fake_redis.scan_iter("*")) == []                        # Redis 안 씀
    assert (config.META_DIR / f"job__{body['jobId']}.json").exists()
    job = started.get(f"/api/jobs/{body['jobId']}").json()
    assert job["status"] == "queued" and "owner" not in job


def test_no_rate_limits_in_desktop(started, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 1)
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 1)
    codes = [started.post("/api/tracks", json={"url": "https://youtu.be/dQw4w9WgXcQ"}).status_code
             for _ in range(5)]
    assert codes == [202] * 5


def test_validation_errors_map_under_api_prefix(started):
    assert started.post("/api/tracks", json={}).json()["error"]["code"] == "INVALID_URL"
    assert started.post("/api/exports", json={}).json()["error"]["code"] == "INVALID_EDIT"


# ---- 파일 저장소 ---------------------------------------------------------------

@pytest.fixture
def file_store(monkeypatch):
    monkeypatch.setattr(config, "DESKTOP", True)


def test_file_store_survives_restart_and_keeps_expiry(file_store):
    job = store.create_job("extract", owner="me")
    path = config.META_DIR / f"job__{job['jobId']}.json"
    expires = json.loads(path.read_text(encoding="utf-8"))["expiresAt"]
    assert expires == pytest.approx(time.time() + config.FILE_TTL_SEC, abs=5)
    store.update_job(job["jobId"], status="running", progress=30)
    assert json.loads(path.read_text(encoding="utf-8"))["expiresAt"] == expires           # KEEPTTL
    assert store.get_job(job["jobId"])["progress"] == 30                    # 파일에서 다시 읽힘


def test_fail_unfinished_on_restart(file_store):
    running = store.create_job("export", owner="me")
    store.update_job(running["jobId"], status="running", progress=40)
    done = store.create_job("extract", owner="me")
    store.update_job(done["jobId"], status="done")
    track = store.create_track(done["jobId"], "u", owner="me")
    assert store.fail_unfinished() == 1
    j = store.get_job(running["jobId"])
    assert j["status"] == "failed" and j["progress"] == 40 and j["etaSeconds"] is None
    assert j["error"] == {"code": "INTERNAL", "message": "문제가 생겼어요. 잠시 후 다시 시도해 주세요."}
    assert store.get_job(done["jobId"])["status"] == "done"
    assert store.get_track(track["trackId"])["status"] == "failed"         # 노래 기록도


def test_expired_records_disappear(file_store, monkeypatch):
    job = store.create_job("extract", owner="me")
    real_time = time.time
    monkeypatch.setattr(store.time, "time", lambda: real_time() + config.FILE_TTL_SEC + 1)
    assert store.get_job(job["jobId"]) is None
    other = config.META_DIR / "job__j_gone.json"
    other.write_text(json.dumps({"expiresAt": 0, "value": {}}), encoding="utf-8")
    assert store.purge_expired() >= 1 and not other.exists()


@pytest.mark.parametrize("bad", ["../../etc/passwd", "j_x/../y", "j x", "", "a" * 200])
def test_file_store_rejects_bad_ids(file_store, bad):
    assert store.get_job(bad) is None
    assert store.get_track(bad) is None


# ---- 스레드 작업자 ------------------------------------------------------------

def test_runtime_runs_tasks_and_counts_busy(monkeypatch):
    import threading
    gate, ran = threading.Event(), []

    def fake_extract(job_id, track_id):
        gate.wait(5)
        ran.append((job_id, track_id))

    monkeypatch.setattr(desktop_runtime, "_task",
                        lambda name: (fake_extract, "extract"))
    try:
        fut = desktop_runtime.submit(queue.EXTRACT_TASK, "j_1", "t_1")
        assert desktop_runtime.busy()
        gate.set()
        fut.result(5)
        assert ran == [("j_1", "t_1")] and not desktop_runtime.busy()
    finally:
        desktop_runtime.stop()


def test_runtime_pool_sizes():
    try:
        assert desktop_runtime._pool("extract")._max_workers == 2
        assert desktop_runtime._pool("export")._max_workers == 1
    finally:
        desktop_runtime.stop()


def test_runtime_start_marks_unfinished_and_cleans(file_store):
    job = store.create_job("extract", owner="me")
    store.update_job(job["jobId"], status="running")
    try:
        desktop_runtime.start()
        assert store.get_job(job["jobId"])["status"] == "failed"
        assert config.TRACKS_DIR.is_dir() and config.EXPORTS_DIR.is_dir()
    finally:
        desktop_runtime.stop()


def test_queue_send_goes_to_runtime_in_desktop(file_store, monkeypatch):
    called = []
    monkeypatch.setattr(desktop_runtime, "submit", lambda name, *a: called.append((name, *a)))
    queue.send(queue.EXPORT_TASK, "j_1", "e_1", {"x": 1})
    assert called == [(queue.EXPORT_TASK, "j_1", "e_1", {"x": 1})]


def test_lifespan_starts_and_stops_runtime(desktop, monkeypatch):
    calls = []
    monkeypatch.setattr(desktop_runtime, "start", lambda: calls.append("start"))
    monkeypatch.setattr(desktop_runtime, "stop", lambda: calls.append("stop"))
    with _client(desktop):
        assert calls == ["start"]
    assert calls == ["start", "stop"]
