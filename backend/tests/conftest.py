import fakeredis
import pytest
from fastapi.testclient import TestClient

from app import accounts, config, queue, store

OWNER = "tester"          # 기본으로 로그인하는 테스트 사용자 (결정 57)
OWNER_PW = "tester-pass"


def login_client(peer: str = "testclient", login_id: str = OWNER) -> TestClient:
    """로그인한 TestClient. 계정이 없으면 만든다."""
    from app.main import app
    if not accounts.user_exists(login_id):
        accounts.add_user(login_id, OWNER_PW)
    c = TestClient(app, client=(peer, 50000), raise_server_exceptions=False)
    res = c.post("/auth/login", json={"loginId": login_id, "password": OWNER_PW})
    assert res.status_code == 200, res.text
    return c


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch, tmp_path):
    r = fakeredis.FakeRedis(decode_responses=True)
    store.set_redis(r)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "TRACKS_DIR", tmp_path / "tracks")
    monkeypatch.setattr(config, "EXPORTS_DIR", tmp_path / "exports")
    monkeypatch.setattr(config, "ACCOUNTS_FILE", tmp_path / "accounts" / "users.json")
    yield r
    store.set_redis(None)


@pytest.fixture
def sent(monkeypatch):
    """queue.send 대신 보낸 작업을 모아 둔다."""
    calls = []
    monkeypatch.setattr(queue, "send", lambda name, *args: calls.append((name, *args)))
    return calls


@pytest.fixture
def client(sent):
    """OWNER로 로그인한 클라이언트."""
    return login_client()


@pytest.fixture
def anon(sent):
    """로그인하지 않은 클라이언트."""
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)
