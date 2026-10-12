"""쉬운 음악 만들기 실행기 (결정 65 · 68 · 69 · 74).

pywebview 창(윈도우: Edge WebView2) + 같은 프로세스 안의 FastAPI(uvicorn 스레드, DESKTOP=true).

    python -m desktop              # 개발(Mac은 Cocoa 창)
    EasyMusic.exe                  # 설치된 프로그램
    EasyMusic.exe --selftest       # CI: 도구 버전 · 서버 · 짧은 변환 확인 (창 없음)
"""
from __future__ import annotations

import argparse
import logging
import logging.handlers
import os
import secrets
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path

from . import paths, single_instance, winjob
from .version import APP_NAME, APP_VERSION

log = logging.getLogger("easymusic")

PORTS = range(47821, 47831)       # 고정 포트, 쓰이고 있으면 다음 (결정 68)
WINDOW_SIZE = (1280, 900)         # 결정 74
MIN_SIZE = (1024, 700)
ALREADY_RUNNING = "쉬운 음악 만들기가 이미 켜져 있어요."
CLOSE_CONFIRM = "노래를 만들고 있어요. 그래도 끌까요?"
START_FAILED = "프로그램을 켜지 못했어요. 컴퓨터를 다시 켠 뒤 한 번 더 해 보세요."


# ---- 준비 ---------------------------------------------------------------------

def setup_logging(home: Path) -> None:
    """창 프로그램이라 콘솔이 없음 → logs\\app.log (1MB × 3개)."""
    logs = home / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(logs / "app.log", maxBytes=1_000_000,
                                                   backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)


def pick_port(ports=PORTS) -> int:
    for port in ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("쓸 수 있는 포트가 없음 (47821~47830)")


def configure_env(home: Path, port: int, key: str, auto_update: bool = True) -> None:
    """app.config는 import할 때 환경 변수를 읽으므로, app을 불러오기 전에 정한다."""
    env = {
        "DESKTOP": "true",
        "DESKTOP_PORT": str(port),
        "DESKTOP_KEY": key,
        "EASYMUSIC_HOME": str(home),
        "FRONTEND_DIST": str(paths.frontend_dist()),
        "EASYMUSIC_YTDLP_UPDATE": "true" if auto_update else "false",
    }
    ytdlp = paths.ensure_ytdlp(home)
    if ytdlp:
        env["EASYMUSIC_YTDLP"] = str(ytdlp)
    for name, var in (("ffmpeg", "EASYMUSIC_FFMPEG"), ("ffprobe", "EASYMUSIC_FFPROBE"), ("deno", "EASYMUSIC_DENO")):
        tool = paths.bundled_tool(name)
        if tool:
            env[var] = str(tool)
    os.environ.update(env)


# ---- 서버 ---------------------------------------------------------------------

class ServerThread:
    def __init__(self, port: int):
        import uvicorn

        from app.main import create_app

        self.port = port
        self.server = uvicorn.Server(uvicorn.Config(
            create_app(desktop=True, api_docs=False), host="127.0.0.1", port=port,
            log_config=None, access_log=False, lifespan="on"))
        self.thread = threading.Thread(target=self.server.run, name="easymusic-server", daemon=True)

    def start(self, timeout: float = 30) -> None:
        self.thread.start()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if health(self.port):
                return
            if not self.thread.is_alive():
                break
            time.sleep(0.1)
        raise RuntimeError("서버가 켜지지 않음")

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)


def health(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as r:
            return r.status == 200
    except OSError:
        return False


# ---- 창 -----------------------------------------------------------------------

def message_box(text: str) -> None:
    """창을 띄우기 전 알림 (두 번째 실행 · 켜기 실패)."""
    log.info("알림: %s", text)
    if os.name == "nt":  # pragma: no cover
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, 0x40)  # MB_ICONINFORMATION
    elif sys.stderr:
        print(text, file=sys.stderr)


def window_size() -> tuple[tuple[int, int], bool]:
    """처음 크기 1280×900, 화면이 그보다 작으면 최대화 (결정 74)."""
    import webview
    try:
        s = webview.screens[0] if isinstance(webview.screens, list) else webview.screens()[0]
        small = s.width < WINDOW_SIZE[0] or s.height < WINDOW_SIZE[1]
    except Exception:  # noqa: BLE001
        small = False
    return WINDOW_SIZE, small


def run_window(home: Path, port: int, key: str) -> None:
    import webview

    from app import desktop_runtime

    size, maximized = window_size()
    window = webview.create_window(
        APP_NAME, f"http://127.0.0.1:{port}/desktop/start?key={key}",
        width=size[0], height=size[1], min_size=MIN_SIZE, maximized=maximized, text_select=True)

    def on_closing():
        # 불러오거나 만드는 중이면 한 번 묻기 (결정 74). False를 돌려주면 닫기 취소
        if desktop_runtime.busy():
            return window.create_confirmation_dialog(APP_NAME, CLOSE_CONFIRM)
        return True

    window.events.closing += on_closing
    # 화면 저장소(글자 크게 · 이어서 하기)를 webview\에 유지 (시크릿 모드 아님)
    webview.start(private_mode=False, storage_path=str(home / "webview"))


# ---- 시작 ---------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="EasyMusic")
    parser.add_argument("--selftest", action="store_true", help="도구 · 서버 확인만 하고 끝 (CI)")
    parser.add_argument("--selftest-out", help="selftest 결과를 쓸 파일")
    args = parser.parse_args(argv)

    home = paths.app_home()
    home.mkdir(parents=True, exist_ok=True)
    setup_logging(home)
    log.info("%s %s 시작 (home=%s, frozen=%s)", APP_NAME, APP_VERSION, home, paths.FROZEN)

    if args.selftest:
        from .selftest import run
        return run(home, Path(args.selftest_out) if args.selftest_out else None)

    try:
        lock = single_instance.InstanceLock(home / "app.lock").acquire()
    except single_instance.AlreadyRunning:
        message_box(ALREADY_RUNNING)
        return 0

    server = None
    try:
        winjob.kill_children_on_exit()
        port = pick_port()
        key = secrets.token_urlsafe(32)  # 실행할 때마다 새 열쇠 (결정 69)
        configure_env(home, port, key)
        server = ServerThread(port)
        server.start()
        log.info("서버 127.0.0.1:%d", port)
        run_window(home, port, key)
        return 0
    except Exception:  # noqa: BLE001
        log.exception("켜기 실패")
        message_box(START_FAILED)
        return 1
    finally:
        if server is not None:
            server.stop()
        lock.release()
        log.info("끝")
