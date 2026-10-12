import fakeredis
import pytest
from fastapi.testclient import TestClient

from app import config, queue, store


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
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)
