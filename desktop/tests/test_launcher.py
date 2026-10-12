"""실행기 (B33, 결정 68 · 69 · 73 · 75). 창(pywebview)은 띄우지 않고 나머지를 시험한다."""
import os
import shutil
import socket
import time

import pytest

from desktop import launcher, paths, single_instance


def test_pick_port_skips_busy():
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        taken = busy.getsockname()[1]
        assert launcher.pick_port([taken, taken + 1]) == taken + 1


def test_pick_port_none_free():
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        with pytest.raises(RuntimeError):
            launcher.pick_port([busy.getsockname()[1]])


def test_instance_lock_blocks_second(tmp_path):
    first = single_instance.InstanceLock(tmp_path / "app.lock").acquire()
    try:
        if os.name != "nt":  # 같은 프로세스 안 flock은 파일 열기마다 따로 → 두 번째 열기로 확인
            with pytest.raises(single_instance.AlreadyRunning):
                single_instance.InstanceLock(tmp_path / "app.lock").acquire()
    finally:
        first.release()
    single_instance.InstanceLock(tmp_path / "app.lock").acquire().release()  # 풀리면 다시 잡힘


def test_ensure_ytdlp_copies_and_refreshes(tmp_path, monkeypatch):
    bundle = tmp_path / "bundle"
    (bundle / "tools").mkdir(parents=True)
    src = bundle / "tools" / f"yt-dlp{paths.EXE}"
    src.write_bytes(b"v1")
    monkeypatch.setattr(paths, "FROZEN", True)
    monkeypatch.setattr(paths, "bundle_dir", lambda: bundle)
    home = tmp_path / "home"

    dst = paths.ensure_ytdlp(home)
    assert dst == home / "bin" / f"yt-dlp{paths.EXE}" and dst.read_bytes() == b"v1"

    dst.write_bytes(b"self-updated")            # yt-dlp -U가 갈아 끼운 것 → 그대로 둠
    os.utime(dst, (time.time() + 10, time.time() + 10))
    assert paths.ensure_ytdlp(home).read_bytes() == b"self-updated"

    src.write_bytes(b"v2-from-new-installer")   # 새 설치 파일이 더 새 것을 넣어 옴
    os.utime(src, (time.time() + 100, time.time() + 100))
    assert paths.ensure_ytdlp(home).read_bytes() == b"v2-from-new-installer"


def test_configure_env(tmp_path, monkeypatch):
    for k in ("DESKTOP", "DESKTOP_PORT", "DESKTOP_KEY", "EASYMUSIC_HOME", "EASYMUSIC_YTDLP_UPDATE"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(os, "environ", dict(os.environ))
    launcher.configure_env(tmp_path, 47825, "k", auto_update=False)
    assert os.environ["DESKTOP"] == "true" and os.environ["DESKTOP_PORT"] == "47825"
    assert os.environ["DESKTOP_KEY"] == "k" and os.environ["EASYMUSIC_HOME"] == str(tmp_path)
    assert os.environ["EASYMUSIC_YTDLP_UPDATE"] == "false"


def test_app_home_override(monkeypatch, tmp_path):
    monkeypatch.setenv("EASYMUSIC_HOME", str(tmp_path / "x"))
    assert paths.app_home() == tmp_path / "x"


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg 없음")
def test_selftest_passes(tmp_path, monkeypatch):
    """CI가 설치된 프로그램에 하는 것과 같은 검사를 개발 환경에서 (창 없음)."""
    import subprocess
    import sys
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>t</title>", encoding="utf-8")
    out = tmp_path / "selftest.txt"
    env = {**os.environ, "EASYMUSIC_HOME": str(tmp_path / "home"), "FRONTEND_DIST": str(dist)}
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    proc = subprocess.run([sys.executable, "-m", "desktop", "--selftest", "--selftest-out", str(out)],
                          cwd=root, env=env, capture_output=True, timeout=120)
    text = out.read_text(encoding="utf-8")
    assert proc.returncode == 0, text
    assert "SELFTEST OK" in text and "OK   /api/health" in text and "OK   ffmpeg convert" in text


UNIX_ONLY = {"fcntl", "pwd", "grp", "termios", "resource", "posix"}


def test_no_module_level_unix_only_imports():
    """윈도우에는 fcntl 등이 없다 → 우리 코드는 모듈 맨 위에서 import하면 안 됨
    (함수 안에서 OS를 확인한 뒤 부르는 것은 괜찮음). B16 accounts.py에서 실제로 걸렸던 것."""
    import ast
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    bad = []
    for folder in ("backend/app", "worker", "desktop"):
        for path in (root / folder).rglob("*.py"):
            if "tests" in path.parts:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in tree.body:  # 모듈 맨 위 문장만
                names = []
                if isinstance(node, ast.Import):
                    names = [a.name.split(".")[0] for a in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names = [node.module.split(".")[0]]
                bad += [f"{path.relative_to(root)}:{node.lineno} {n}" for n in names if n in UNIX_ONLY]
    assert bad == []


def test_fetch_tools_console_survives_non_utf8_locale():
    """CI 윈도우 콘솔은 cp1252 → 한글 print가 UnicodeEncodeError로 빌드를 멈췄을 것. 라틴-1 환경으로 흉내."""
    import subprocess
    import sys
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    code = "import desktop.fetch_tools as f; f.safe_console(); print('받는 중: 한글')"
    env = {**os.environ, "LC_ALL": "en_US.ISO8859-1", "LANG": "en_US.ISO8859-1", "PYTHONUTF8": "0"}
    env.pop("PYTHONIOENCODING", None)
    out = subprocess.run([sys.executable, "-c", code], cwd=root, env=env, capture_output=True)
    assert out.returncode == 0, out.stderr.decode("utf-8", "replace")
    assert b"\\ubc1b" in out.stdout   # 못 찍는 글자는 이스케이프로
