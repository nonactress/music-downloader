"""실행 파일 · 도구 · 데이터 폴더 위치 (결정 67 · 73)."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from .version import APP_ID

FROZEN = getattr(sys, "frozen", False)  # PyInstaller로 묶였는지
EXE = ".exe" if os.name == "nt" else ""


def bundle_dir() -> Path:
    """묶인 파일이 있는 곳. PyInstaller 한 폴더 빌드면 _internal, 개발이면 레포 루트."""
    if FROZEN:
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[1]


def app_home() -> Path:
    """%LOCALAPPDATA%\\EasyMusic (개발용 Mac은 ~/Library/Application Support/EasyMusic). EASYMUSIC_HOME으로 바꿀 수 있음."""
    if os.environ.get("EASYMUSIC_HOME"):
        return Path(os.environ["EASYMUSIC_HOME"])
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / APP_ID
    return Path.home() / "Library" / "Application Support" / APP_ID


def frontend_dist() -> Path:
    """화면 파일. 개발 중에는 FRONTEND_DIST로 다른 빌드를 가리킬 수 있음."""
    if os.environ.get("FRONTEND_DIST"):
        return Path(os.environ["FRONTEND_DIST"])
    return bundle_dir() / "frontend" if FROZEN else bundle_dir() / "frontend" / "dist"


def bundled_tool(name: str) -> Path | None:
    """함께 넣은 도구 (tools/<name>.exe). 개발 중에는 PATH · venv에서 찾는다."""
    p = bundle_dir() / "tools" / f"{name}{EXE}"
    if p.exists():
        return p
    if name == "yt-dlp":  # 개발: venv의 yt-dlp 실행 파일
        venv = Path(sys.executable).parent / f"yt-dlp{EXE}"
        if venv.exists():
            return venv
    found = shutil.which(name)
    return Path(found) if found else None


def ensure_ytdlp(home: Path) -> Path | None:
    """yt-dlp는 스스로 갱신(-U)해야 하므로 쓰기 가능한 bin\\에 복사해 두고 그것을 쓴다.
    설치 파일이 더 새 yt-dlp를 넣어 왔으면(파일 시각이 더 새로우면) 덮어쓴다."""
    src = bundled_tool("yt-dlp")
    if src is None:
        return None
    if not FROZEN and src.parent != bundle_dir() / "tools":
        return src  # 개발: venv 것을 그대로 (갱신은 pip가 담당)
    dst = home / "bin" / f"yt-dlp{EXE}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime:
        shutil.copy2(src, dst)
    return dst
