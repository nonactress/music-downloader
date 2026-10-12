"""POST /tracks IP당 하루(24시간 창) 노래 수 한도 (결정 52, CONTRACT v1.5)."""
import pytest
from fastapi.testclient import TestClient

from app import config, store
from app.main import app  # noqa: F401
from tests.conftest import login_client

URL = {"url": "https://youtu.be/dQw4w9WgXcQ"}
NGINX = "172.18.0.5"


def _client(peer="203.0.113.7"):
    return login_client(peer)


@pytest.fixture(autouse=True)
def _no_minute_limit(monkeypatch, sent):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 10_000)  # 분당 제한은 따로 테스트됨


def test_100th_ok_101st_rejected(sent):
    c = _client()
    codes = [c.post("/tracks", json=URL).status_code for _ in range(100)]
    assert codes == [202] * 100
    res = c.post("/tracks", json=URL)
    assert res.status_code == 429
    assert res.json()["error"] == {"code": "RATE_LIMITED",
                                   "message": "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
                                   "detail": "daily track limit"}
    assert len(sent) == 100  # 101번째는 작업을 만들지 않음


def test_other_ip_not_affected(monkeypatch):
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 3)
    a, b = _client("203.0.113.1"), _client("203.0.113.2")
    assert [a.post("/tracks", json=URL).status_code for _ in range(4)] == [202, 202, 202, 429]
    assert b.post("/tracks", json=URL).status_code == 202


def test_counts_real_user_behind_proxy(monkeypatch):
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 2)
    c = _client(NGINX)
    h1 = {"X-Forwarded-For": "198.51.100.1"}
    h2 = {"X-Forwarded-For": "6.6.6.6, 198.51.100.2"}   # 왼쪽 위조값은 무시
    assert [c.post("/tracks", json=URL, headers=h1).status_code for _ in range(3)] == [202, 202, 429]
    assert c.post("/tracks", json=URL, headers=h2).status_code == 202
    # 왼쪽 값을 바꿔도 같은 사람
    h1_spoof = {"X-Forwarded-For": "7.7.7.7, 198.51.100.1"}
    assert c.post("/tracks", json=URL, headers=h1_spoof).status_code == 429


def test_bad_url_does_not_use_quota(monkeypatch):
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 1)
    c = _client()
    assert c.post("/tracks", json={"url": "https://naver.com"}).status_code == 400
    assert c.post("/tracks", json={"url": "https://www.youtube.com/playlist?list=PLx"}).status_code == 400
    assert c.post("/tracks", json=URL).status_code == 202
    assert c.post("/tracks", json=URL).status_code == 429


def test_sliding_24h_window(monkeypatch):
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 2)
    now = [1_000_000.0]
    monkeypatch.setattr(store.time, "time", lambda: now[0])
    c = _client()
    assert c.post("/tracks", json=URL).status_code == 202      # t=0
    now[0] += 12 * 3600
    assert c.post("/tracks", json=URL).status_code == 202      # t=12h
    assert c.post("/tracks", json=URL).status_code == 429
    now[0] += 12 * 3600 + 1                                     # t=24h+1s → 첫 곡이 창 밖으로
    assert c.post("/tracks", json=URL).status_code == 202
    assert c.post("/tracks", json=URL).status_code == 429      # 12h 곡은 아직 창 안


def test_rejected_requests_do_not_extend_block(monkeypatch):
    """거절된 요청은 기록하지 않음 → 계속 눌러도 24시간 뒤엔 풀림."""
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 1)
    now = [2_000_000.0]
    monkeypatch.setattr(store.time, "time", lambda: now[0])
    c = _client()
    assert c.post("/tracks", json=URL).status_code == 202
    for _ in range(5):
        now[0] += 3600
        assert c.post("/tracks", json=URL).status_code == 429
    now[0] = 2_000_000.0 + 24 * 3600 + 1
    assert c.post("/tracks", json=URL).status_code == 202


def test_zero_disables(monkeypatch):
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 0)
    c = _client()
    assert all(c.post("/tracks", json=URL).status_code == 202 for _ in range(5))


def test_exports_not_limited_daily(monkeypatch, fake_redis):
    monkeypatch.setattr(config, "DAILY_TRACK_LIMIT", 1)
    c = _client()
    c.post("/tracks", json=URL)
    assert c.post("/exports", json={}).status_code == 422   # 하루 한도가 아니라 검증 실패
    assert not any(k.startswith("daily:") and "exports" in k for k in fake_redis.scan_iter("*"))


def test_daily_key_expires(fake_redis):
    c = _client("203.0.113.50")
    c.post("/tracks", json=URL)
    ttl = fake_redis.ttl("daily:tracks:203.0.113.50")
    assert 24 * 3600 - 5 < ttl <= 24 * 3600
