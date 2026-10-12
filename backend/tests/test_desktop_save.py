"""데스크톱: 다운로드 폴더에 저장 · 저장한 곳 열기 (CONTRACT 7-3 · 7-4, 결정 71)."""
import os
import sys

import pytest
from fastapi.testclient import TestClient

from app import config, downloads, store
from app.main import create_app
from tests.test_desktop import BASE, KEY, PORT  # noqa: F401 — 같은 설정

MP3 = b"ID3fake-mp3-bytes" * 100


@pytest.fixture
def dl(tmp_path, monkeypatch):
    d = tmp_path / "Downloads"
    monkeypatch.setattr(config, "DOWNLOADS_DIR", str(d))
    return d


@pytest.fixture
def opened(monkeypatch):
    calls = []
    monkeypatch.setattr(downloads, "open_in_file_manager", lambda cmd: calls.append(cmd))
    return calls


@pytest.fixture
def c(monkeypatch, tmp_path, sent, dl, opened):
    monkeypatch.setattr(config, "DESKTOP", True)
    monkeypatch.setattr(config, "DESKTOP_KEY", KEY)
    monkeypatch.setattr(config, "DESKTOP_PORT", PORT)
    monkeypatch.setattr(config, "FRONTEND_DIST", tmp_path / "nodist")
    client = TestClient(create_app(desktop=True, api_docs=False), base_url=BASE, raise_server_exceptions=False)
    assert client.get(f"/desktop/start?key={KEY}", follow_redirects=False).status_code == 302
    return client


def _export(status="done", with_file=True, file_name="내 노래_1011.mp3", owner="me"):
    job = store.create_job("export", owner=owner)
    exp = store.create_export(job["jobId"], owner=owner)
    if with_file:
        config.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
        config.export_path(exp["exportId"]).write_bytes(MP3)
    store.update_export(exp["exportId"], status=status, fileName=file_name)
    return exp["exportId"]


def test_save_to_downloads_and_number_duplicates(c, dl):
    eid = _export()
    names = []
    for _ in range(3):
        res = c.post(f"/api/exports/{eid}/save")
        assert res.status_code == 200
        body = res.json()
        assert set(body) == {"fileName", "savedId"}
        names.append(body["fileName"])
    assert names == ["내 노래_1011.mp3", "내 노래_1011 (2).mp3", "내 노래_1011 (3).mp3"]
    for n in names:
        assert (dl / n).read_bytes() == MP3          # 덮어쓰지 않고 한 벌씩 더


def test_existing_user_file_not_overwritten(c, dl):
    dl.mkdir(parents=True)
    (dl / "내 노래_1011.mp3").write_bytes(b"user's own file")
    res = c.post(f"/api/exports/{_export()}/save")
    assert res.json()["fileName"] == "내 노래_1011 (2).mp3"
    assert (dl / "내 노래_1011.mp3").read_bytes() == b"user's own file"


@pytest.mark.parametrize("kind,code,status", [
    ("missing", "NOT_FOUND", 404), ("failed", "NOT_FOUND", 404), ("running", "NOT_READY", 409),
    ("nofile", "NOT_FOUND", 404), ("other", "NOT_FOUND", 404),
])
def test_save_errors_like_download(c, kind, code, status):
    eid = {"missing": lambda: "e_nope",
           "failed": lambda: _export(status="failed"),
           "running": lambda: _export(status="running", with_file=False),
           "nofile": lambda: _export(with_file=False),
           "other": lambda: _export(owner="someone")}[kind]()
    res = c.post(f"/api/exports/{eid}/save")
    assert res.status_code == status and res.json()["error"]["code"] == code


def test_save_failed_when_folder_unwritable(c, dl):
    dl.parent.mkdir(parents=True, exist_ok=True)
    dl.write_text("not a folder")                    # 폴더 자리에 파일 → 저장 실패
    res = c.post(f"/api/exports/{_export()}/save")
    assert res.status_code == 500
    assert res.json()["error"]["code"] == "SAVE_FAILED"
    assert res.json()["error"]["message"] == "컴퓨터에 저장하지 못했어요. 다시 눌러 주세요."


def test_partial_file_removed_on_copy_error(c, dl, monkeypatch):
    def boom(*a, **k):
        raise OSError("disk full")
    monkeypatch.setattr(downloads.shutil, "copyfileobj", boom)
    res = c.post(f"/api/exports/{_export()}/save")
    assert res.json()["error"]["code"] == "SAVE_FAILED"
    assert list(dl.iterdir()) == []


def test_reveal_selects_saved_file(c, dl, opened):
    saved = c.post(f"/api/exports/{_export()}/save").json()
    res = c.post(f"/api/desktop/reveal/{saved['savedId']}")
    assert res.status_code == 204 and res.content == b""
    cmd = opened[-1]
    path = str(dl / saved["fileName"])
    if os.name == "nt":
        assert cmd == ["explorer", f"/select,{path}"]
    elif sys.platform == "darwin":
        assert cmd == ["open", "-R", path]


def test_reveal_deleted_file_opens_folder(c, dl, opened):
    saved = c.post(f"/api/exports/{_export()}/save").json()
    (dl / saved["fileName"]).unlink()
    assert c.post(f"/api/desktop/reveal/{saved['savedId']}").status_code == 204
    assert opened[-1][-1] == str(dl)                 # 다운로드 폴더만


@pytest.mark.parametrize("sid", ["abcdef123456", "nope", "../x", "ABCDEF123456"])
def test_reveal_unknown_404(c, opened, sid):
    res = c.post(f"/api/desktop/reveal/{sid}")
    assert res.status_code == 404 and res.json()["error"]["code"] == "NOT_FOUND"
    assert opened == []


def test_reveal_and_save_need_session(c, monkeypatch):
    anon = TestClient(c.app, base_url=BASE, raise_server_exceptions=False)
    assert anon.post(f"/api/exports/{_export()}/save").status_code == 401
    assert anon.post("/api/desktop/reveal/abcdef123456").status_code == 401


def test_not_in_server_mode(client):
    """서버 모드에는 저장 · 저장한 곳 열기가 없다 (CONTRACT 7-3)."""
    assert client.post("/exports/e_x/save").status_code == 404
    assert client.post("/desktop/reveal/abcdef123456").status_code == 404


def test_reveal_command_shapes(tmp_path, monkeypatch):
    f = tmp_path / "내 노래.mp3"
    f.write_bytes(b"x")
    monkeypatch.setattr(downloads.os, "name", "nt")
    assert downloads.reveal_command(f) == ["explorer", f"/select,{f}"]   # 하나의 인자로 (인자 리스트)
