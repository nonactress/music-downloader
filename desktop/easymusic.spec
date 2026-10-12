# -*- mode: python ; coding: utf-8 -*-
# PyInstaller: 한 폴더 빌드(결정 75). 레포 루트에서
#   pyinstaller desktop/easymusic.spec --noconfirm --distpath dist --workpath build/pyinstaller
# 먼저 필요: frontend/dist (npm run build), build/tools (python desktop/fetch_tools.py)
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).resolve().parent
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]  # collect_submodules가 app · worker를 찾게


def ours(package):
    # 테스트 · Celery 등록(서버 모드 전용)은 넣지 않음
    return [m for m in collect_submodules(package)
            if ".tests" not in m and m not in ("worker.celery_app", "worker.celery_tasks")]


hiddenimports = (
    ours("app") + ours("worker") + ours("desktop")
    + collect_submodules("uvicorn")
    + ["webview.platforms.winforms", "webview.platforms.edgechromium"]
)

for required in (ROOT / "frontend" / "dist" / "index.html", ROOT / "build" / "tools" / "yt-dlp.exe"):
    if not required.exists():
        raise SystemExit(f"없음: {required} — README '윈도우 프로그램 빌드' 순서대로 먼저 만들 것")

a = Analysis(
    [str(ROOT / "desktop" / "__main__.py")],
    pathex=[str(ROOT), str(ROOT / "backend")],
    datas=[
        (str(ROOT / "frontend" / "dist"), "frontend"),
        (str(ROOT / "build" / "tools"), "tools"),
    ],
    hiddenimports=hiddenimports,
    # 데스크톱은 Celery · Redis 서버를 쓰지 않음 (스레드 작업자 · 파일 저장소). Celery는 모듈을
    # 이름으로 불러와서 묶으면 깨지기도 함 → 아예 뺌
    excludes=["tkinter", "pytest", "fakeredis", "_pytest", "celery", "kombu", "billiard", "amqp", "vine"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="EasyMusic",
    console=False,          # 창 프로그램 (콘솔 창 없음)
    upx=False,              # UPX는 백신 오탐을 늘림
)
coll = COLLECT(exe, a.binaries, a.datas, name="EasyMusic", upx=False)
