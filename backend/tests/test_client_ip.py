"""요청 수 제한의 사용자 IP 판단 (결정 50) — X-Forwarded-For 위조 방지."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

VID = "dQw4w9WgXcQ"
NGINX = "172.18.0.5"      # compose 내부망 (기본 신뢰 대역)
OUTSIDE = "203.0.113.7"   # 인터넷에서 바로 접속


def _client(peer):
    return TestClient(app, client=(peer, 50000), raise_server_exceptions=False)


def _post(c, xff=None):
    headers = {"X-Forwarded-For": xff} if xff is not None else {}
    return c.post("/tracks", json={"url": f"https://youtu.be/{VID}"}, headers=headers).status_code


@pytest.fixture(autouse=True)
def _limit_one(monkeypatch, sent):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 1)


def test_trusted_proxy_uses_rightmost_forwarded_ip():
    c = _client(NGINX)
    assert _post(c, "198.51.100.1") == 202
    assert _post(c, "198.51.100.2") == 202          # 다른 사용자 → 따로 셈
    assert _post(c, "198.51.100.1") == 429          # 같은 사용자 → 제한


def test_spoofed_leftmost_value_ignored_behind_proxy():
    """사용자가 넣은 가짜 값은 왼쪽에 남고, nginx가 붙인 진짜 주소가 맨 오른쪽."""
    c = _client(NGINX)
    assert _post(c, "1.1.1.1, 198.51.100.9") == 202
    assert _post(c, "2.2.2.2, 198.51.100.9") == 429  # 왼쪽을 바꿔도 같은 사람


def test_untrusted_peer_cannot_spoof():
    """프록시를 거치지 않고 바로 붙은 사람이 X-Forwarded-For를 바꿔 가며 보내도 접속 IP로 센다."""
    c = _client(OUTSIDE)
    assert _post(c, "10.0.0.1") == 202
    assert _post(c, "10.0.0.2") == 429
    assert _post(c) == 429


def test_trusted_proxy_without_header_uses_peer():
    c = _client(NGINX)
    assert _post(c) == 202
    assert _post(c) == 429


@pytest.mark.parametrize("bad", ["not-an-ip", "", " , ", "999.1.1.1"])
def test_garbage_header_falls_back_to_peer(bad):
    c = _client(NGINX)
    assert _post(c, bad) == 202
    assert _post(c, "also-bad") == 429               # 둘 다 nginx 주소로 셈


def test_multiple_header_lines_use_last_value():
    from app.ratelimit import client_ip
    from starlette.requests import Request
    scope = {"type": "http", "client": (NGINX, 1), "headers": [
        (b"x-forwarded-for", b"9.9.9.9"), (b"x-forwarded-for", b"5.5.5.5, 198.51.100.3")]}
    assert client_ip(Request(scope)) == "198.51.100.3"


def test_trusted_list_from_env(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_IPS", "10.9.0.0/16")
    c = _client(NGINX)                                # 이제 172.18.x는 신뢰 안 함
    assert _post(c, "198.51.100.1") == 202
    assert _post(c, "198.51.100.2") == 429
    c2 = _client("10.9.3.4")
    assert _post(c2, "198.51.100.1") == 202


def test_ipv6():
    c = _client("::1")
    assert _post(c, "2001:db8::1") == 202
    assert _post(c, "2001:db8::2") == 202
    assert _post(c, "2001:db8::1") == 429
