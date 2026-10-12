"""데스크톱: 완성된 mp3를 다운로드 폴더에 저장 · 저장한 곳 열기 (CONTRACT 7-3 · 7-4, 결정 71)."""
from __future__ import annotations

import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
from pathlib import Path

from . import config

# 이번 실행 동안의 저장 기록: savedId → 저장한 파일 경로 (프론트는 경로를 보내지 않음)
_saved: dict[str, Path] = {}
_saved_lock = threading.Lock()
_SAVED_ID_RE = re.compile(r"^[0-9a-f]{12}$")


def downloads_dir() -> Path:
    """윈도우는 알려진 폴더 FOLDERID_Downloads (사용자가 옮겼어도 정확), 그 밖은 ~/Downloads."""
    if config.DOWNLOADS_DIR:
        return Path(config.DOWNLOADS_DIR)
    if os.name == "nt":
        try:
            return _windows_downloads()
        except OSError:
            pass
    return Path.home() / "Downloads"


def _windows_downloads() -> Path:  # pragma: no cover — 윈도우 CI에서 selftest로 확인
    import ctypes
    from ctypes import wintypes
    import uuid

    class GUID(ctypes.Structure):
        _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD),
                    ("Data3", wintypes.WORD), ("Data4", ctypes.c_ubyte * 8)]

    u = uuid.UUID("374DE290-123F-4565-9164-39C4925E467B")  # FOLDERID_Downloads
    guid = GUID(u.fields[0], u.fields[1], u.fields[2], (ctypes.c_ubyte * 8)(*u.bytes[8:]))
    out = ctypes.c_wchar_p()
    hr = ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(out))
    if hr != 0:
        raise OSError(f"SHGetKnownFolderPath {hr}")
    try:
        return Path(out.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(out)


def _candidates(file_name: str):
    """내 노래_1011.mp3, 내 노래_1011 (2).mp3, (3) …"""
    stem, dot, ext = file_name.rpartition(".")
    if not dot:
        stem, ext = file_name, ""
    yield file_name
    for n in range(2, 1000):
        yield f"{stem} ({n}){'.' + ext if ext else ''}"


def save_copy(src: Path, file_name: str) -> tuple[str, str]:
    """다운로드 폴더에 복사 (덮어쓰지 않음). (저장한 이름, savedId). 실패하면 OSError."""
    folder = downloads_dir()
    folder.mkdir(parents=True, exist_ok=True)
    for name in _candidates(file_name):
        target = folder / name
        try:
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o644)
        except FileExistsError:
            continue
        try:
            with os.fdopen(fd, "wb") as out, open(src, "rb") as inp:
                shutil.copyfileobj(inp, out, 1024 * 1024)
        except BaseException:
            target.unlink(missing_ok=True)  # 반쯤 쓴 파일은 남기지 않음
            raise
        saved_id = secrets.token_hex(6)
        with _saved_lock:
            _saved[saved_id] = target
        return name, saved_id
    raise OSError("같은 이름이 너무 많음")


def saved_path(saved_id: str) -> Path | None:
    if not _SAVED_ID_RE.match(saved_id or ""):
        return None
    with _saved_lock:
        return _saved.get(saved_id)


def reveal_command(path: Path | None) -> list[str]:
    """파일 탐색기에서 그 파일을 선택한 채로 (없으면 다운로드 폴더만). 인자 리스트로."""
    if path is not None and path.exists():
        if os.name == "nt":
            return ["explorer", f"/select,{path}"]
        if sys.platform == "darwin":
            return ["open", "-R", str(path)]
        return ["xdg-open", str(path.parent)]
    folder = downloads_dir()
    if os.name == "nt":
        return ["explorer", str(folder)]
    if sys.platform == "darwin":
        return ["open", str(folder)]
    return ["xdg-open", str(folder)]


def open_in_file_manager(cmd: list[str]) -> None:
    """기다리지 않고 띄움 (explorer는 성공해도 종료 코드 1을 내는 일이 있어 결과를 보지 않음)."""
    flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, **flags)
