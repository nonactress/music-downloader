"""CI: 도구를 받아 SHA-256을 확인한 뒤 build/tools에 푼다 (결정 75).

    python desktop/fetch_tools.py --out build/tools

해시가 다르면 아무것도 풀지 않고 실패한다. 라이선스 파일도 함께 둔다 (ffmpeg는 GPL 빌드).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "easymusic-build"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f, 1024 * 1024)


def fetch(name: str, spec: dict, out: Path, cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / spec["url"].rsplit("/", 1)[-1]
    if not archive.exists() or sha256(archive) != spec["sha256"]:
        print(f"받는 중: {name} {spec['version']}")
        download(spec["url"], archive)
    got = sha256(archive)
    if got != spec["sha256"]:
        archive.unlink(missing_ok=True)
        raise SystemExit(f"{name}: SHA-256이 다름\n  기대 {spec['sha256']}\n  받음 {got}")
    for member, target in spec["extract"].items():
        dest = out / target
        dest.parent.mkdir(parents=True, exist_ok=True)
        if archive.suffix == ".zip":
            with zipfile.ZipFile(archive) as z, z.open(member) as src, open(dest, "wb") as f:
                shutil.copyfileobj(src, f)
        else:
            shutil.copyfile(archive, dest)
    print(f"확인 · 풀기 끝: {name} {spec['version']} ({got[:12]}…)")


def safe_console() -> None:
    """윈도우 CI 콘솔(cp1252)은 한글을 못 찍는다 → 못 찍는 글자는 \\uXXXX로 (멈추지 않게)."""
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")


def main(argv=None) -> int:
    safe_console()
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path("build/tools"))
    p.add_argument("--cache", type=Path, default=Path("build/downloads"))
    p.add_argument("--only", nargs="*", help="이 도구만 (시험용)")
    args = p.parse_args(argv)
    tools = {k: v for k, v in json.loads((HERE / "tools.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
    args.out.mkdir(parents=True, exist_ok=True)
    notes = []
    for name, spec in tools.items():
        if args.only and name not in args.only:
            continue
        fetch(name, spec, args.out, args.cache)
        notes.append(f"{name} {spec['version']} — {spec['license']} — {spec['url']}")
    lic = args.out / "licenses"
    lic.mkdir(parents=True, exist_ok=True)
    (lic / "THIRD_PARTY.txt").write_text(
        "쉬운 음악 만들기에 함께 들어 있는 프로그램\n\n" + "\n".join(notes) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
