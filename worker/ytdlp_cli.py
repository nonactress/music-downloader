"""yt-dlp 실행 파일로 받기 (데스크톱, 결정 73).

PyInstaller에 묶인 파이썬 yt_dlp는 스스로 갱신(-U)할 수 없으므로, 데스크톱은 공식 yt-dlp.exe를
인자 리스트 subprocess로 부른다. 켤 때 뒤에서 `yt-dlp -U`로 최신화한다.
서버 모드(EASYMUSIC_YTDLP 비어 있음)는 지금처럼 파이썬 라이브러리를 쓴다.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Callable

from app import config
from worker.media import popen_flags

log = logging.getLogger(__name__)

PROGRESS_PREFIX = "EMPROG"
PROGRESS_TEMPLATE = (f"download:{PROGRESS_PREFIX} %(progress.status)s %(progress.downloaded_bytes)s "
                     "%(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.eta)s")
UPDATE_TIMEOUT_SEC = 120

# 켤 때 갱신이 끝날 때까지 추출은 기다린다 (갱신 중인 exe를 부르지 않게)
ready = threading.Event()
ready.set()


class CliError(Exception):
    """yt-dlp가 실패함. 메시지는 yt-dlp의 ERROR 줄 (분류는 extract._classify_download_error)."""


class CliTimeout(Exception):
    pass


def enabled() -> bool:
    return bool(config.YTDLP_BIN)


def _base_args() -> list[str]:
    args = [config.YTDLP_BIN, "--no-playlist", "--no-warnings", "--no-color",
            "--socket-timeout", "20", "--retries", "3", "--no-cache-dir"]
    if config.DENO_BIN:
        args += ["--js-runtimes", f"deno:{config.DENO_BIN}"]
    ffmpeg = Path(config.FFMPEG_BIN)
    if ffmpeg.parent != Path("."):  # 경로로 지정된 ffmpeg면 yt-dlp에도 알려 줌
        args += ["--ffmpeg-location", str(ffmpeg.parent)]
    return args


def _error_text(stderr: str) -> str:
    lines = [l for l in stderr.splitlines() if l.strip()]
    errors = [l for l in lines if l.startswith("ERROR")]
    return (errors[-1] if errors else (lines[-1] if lines else "yt-dlp 실패"))[:500]


def fetch_info(url: str, timeout: float) -> dict:
    """영상 정보 JSON (-J). 실패하면 CliError, 시간 넘으면 CliTimeout."""
    ready.wait(UPDATE_TIMEOUT_SEC)
    try:
        out = subprocess.run([*_base_args(), "--dump-single-json", "--skip-download", "--", url],
                             stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout,
                             **popen_flags())
    except subprocess.TimeoutExpired as e:
        raise CliTimeout("영상 정보") from e
    if out.returncode != 0:
        raise CliError(_error_text(out.stderr.decode("utf-8", "replace")))
    try:
        return json.loads(out.stdout)
    except ValueError as e:
        raise CliError(f"정보 JSON을 읽지 못함: {out.stdout[:200]!r}") from e


def parse_progress(line: str) -> dict | None:
    """'EMPROG downloading 1024 252182 NA 962' → yt-dlp 진행률 훅과 같은 모양의 dict."""
    parts = line.split()
    if len(parts) != 6 or parts[0] != PROGRESS_PREFIX:
        return None

    def num(v: str):
        try:
            return int(float(v))
        except ValueError:
            return None  # NA

    return {"status": parts[1], "downloaded_bytes": num(parts[2]), "total_bytes": num(parts[3]),
            "total_bytes_estimate": num(parts[4]), "eta": num(parts[5])}


def download(info: dict, work_dir: Path, on_progress: Callable[[dict], None],
             timeout: float, max_bytes: int) -> None:
    """정보 JSON을 다시 쓰지 않고(--load-info-json) 오디오만 받는다.
    on_progress가 예외를 던지면(예: 너무 큰 파일) 받기를 멈추고 그 예외를 그대로 올린다."""
    info_path = work_dir / "info.json"
    info_path.write_text(json.dumps(info), encoding="utf-8")
    err_path = work_dir / "yt-dlp.err"
    cmd = [*_base_args(), "--load-info-json", str(info_path), "-f", "bestaudio/best",
           "-o", str(work_dir / "source.%(ext)s"), "--max-filesize", str(max_bytes),
           "--quiet", "--progress", "--newline", "--progress-template", PROGRESS_TEMPLATE]
    timed_out = threading.Event()
    with open(err_path, "wb") as err:
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=err,
                                text=True, encoding="utf-8", errors="replace", **popen_flags())

        def _kill():
            timed_out.set()
            if proc.poll() is None:
                proc.kill()

        watchdog = threading.Timer(timeout, _kill)
        watchdog.daemon = True
        watchdog.start()
        try:
            for line in proc.stdout:
                d = parse_progress(line)
                if d is not None:
                    on_progress(d)
            proc.wait()
        finally:
            watchdog.cancel()
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    if timed_out.is_set():
        raise CliTimeout("받기")
    if proc.returncode != 0:
        raise CliError(_error_text(err_path.read_text(encoding="utf-8", errors="replace")))


def self_update() -> None:
    """켤 때 뒤에서 `yt-dlp -U` (공식 서명 · 체크섬 검사는 yt-dlp가 함). 실패하면 있던 것 그대로."""
    if not (enabled() and config.YTDLP_AUTO_UPDATE):
        return
    ready.clear()
    try:
        out = subprocess.run([config.YTDLP_BIN, "-U"], stdin=subprocess.DEVNULL, capture_output=True,
                             timeout=UPDATE_TIMEOUT_SEC, **popen_flags())
        text = (out.stdout + out.stderr).decode("utf-8", "replace").strip().splitlines()
        log.info("yt-dlp -U (exit %s): %s", out.returncode, text[-1] if text else "")
    except (OSError, subprocess.TimeoutExpired) as e:
        log.warning("yt-dlp 갱신 실패 — 있던 것 그대로 씀: %s", e)
    finally:
        ready.set()


def version() -> str:
    out = subprocess.run([config.YTDLP_BIN, "--version"], stdin=subprocess.DEVNULL, capture_output=True,
                         timeout=30, **popen_flags())
    return out.stdout.decode().strip()
