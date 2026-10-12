"""`EasyMusic.exe --selftest` (결정 75): 설치된 프로그램이 제대로 묶였는지 CI에서 확인.

1. 도구 3개(yt-dlp · ffmpeg · deno) 버전
2. 서버를 켜서 /api/health 200, 열쇠로 /desktop/start 302 → 화면(index.html) 200
3. 짧은 오디오 ffmpeg 변환 → mp3 길이 확인
실제 유튜브 받기는 하지 않음 (CI는 데이터센터 IP라 막힘).
창 프로그램은 콘솔이 없으므로 결과를 파일(--selftest-out, 기본 logs\\selftest.txt)에도 쓴다. 성공 0, 실패 1.
"""
from __future__ import annotations

import http.client
import secrets
import subprocess
import tempfile
import traceback
from pathlib import Path

from . import launcher, paths


def _first_line(cmd: list[str]) -> str:
    from worker.media import popen_flags
    out = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, timeout=60, **popen_flags())
    text = (out.stdout or out.stderr).decode("utf-8", "replace").strip().splitlines()
    if out.returncode != 0:
        raise RuntimeError(f"{cmd[0]} exit {out.returncode}")
    return text[0] if text else ""


def _get(port: int, path: str, cookie: str = "") -> http.client.HTTPResponse:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    conn.request("GET", path, headers={"Cookie": cookie} if cookie else {})
    return conn.getresponse()


def run(home: Path, out_file: Path | None = None) -> int:
    lines: list[str] = []
    ok = True

    def check(name: str, fn) -> None:
        nonlocal ok
        try:
            lines.append(f"OK   {name}: {fn()}")
        except Exception as e:  # noqa: BLE001
            ok = False
            lines.append(f"FAIL {name}: {e!r}")
            lines.append(traceback.format_exc())

    test_home = Path(tempfile.mkdtemp(prefix="easymusic-selftest-"))  # 사용자 데이터는 건드리지 않음
    port = launcher.pick_port(range(47900, 47950))
    key = secrets.token_urlsafe(16)
    launcher.configure_env(test_home, port, key, auto_update=False)

    from app import config
    check("frontend", lambda: (paths.frontend_dist() / "index.html").stat().st_size)
    check("yt-dlp", lambda: _first_line([config.YTDLP_BIN, "--version"]))
    check("ffmpeg", lambda: _first_line([config.FFMPEG_BIN, "-version"]))
    check("ffprobe", lambda: _first_line([config.FFPROBE_BIN, "-version"]))
    check("deno", lambda: _first_line([config.DENO_BIN, "--version"]) if config.DENO_BIN else "없음(개발)")

    server = None
    try:
        server = launcher.ServerThread(port)
        check("server", lambda: (server.start(), "started")[1])

        def health():
            r = _get(port, "/api/health")
            assert r.status == 200, r.status
            return r.read().decode()
        check("/api/health", health)

        def start_and_page():
            r = _get(port, f"/desktop/start?key={key}")
            assert r.status == 302, r.status
            cookie = r.getheader("set-cookie", "").split(";")[0]
            page = _get(port, "/", cookie)
            assert page.status == 200 and b"<" in page.read(200)
            me = _get(port, "/api/auth/me", cookie)
            assert me.status == 200, me.status
            return me.read().decode()
        check("desktop session", start_and_page)

        def convert():
            from worker import media
            work = test_home / "convert"
            work.mkdir()
            src = work / "tone.wav"
            subprocess.run([config.FFMPEG_BIN, "-hide_banner", "-nostdin", "-v", "error", "-y",
                            "-f", "lavfi", "-i", "sine=frequency=440:duration=2", str(src)],
                           check=True, stdin=subprocess.DEVNULL, **media.popen_flags())
            media.convert_to_mp3(src, work / "out.mp3")
            dur = media.probe_duration(work / "out.mp3")
            assert 1.5 < dur < 2.5, dur
            return f"{dur:.2f}s"
        check("ffmpeg convert", convert)
    finally:
        if server is not None:
            server.stop()

    lines.append("SELFTEST OK" if ok else "SELFTEST FAILED")
    text = "\n".join(lines) + "\n"
    target = out_file or home / "logs" / "selftest.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    try:
        print(text)  # 콘솔이 있을 때만 (개발 · python -m desktop --selftest)
    except Exception:  # noqa: BLE001
        pass
    return 0 if ok else 1
