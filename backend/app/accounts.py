"""로그인 계정 저장 + 관리 명령 (PLAN 결정 54 · 55).

회원가입은 없다. 관리자가 명령어로 계정을 만들어 나눠 준다:

    docker compose exec api python -m app.accounts add <아이디>
    docker compose exec api python -m app.accounts passwd <아이디>
    docker compose exec api python -m app.accounts remove <아이디>
    docker compose exec api python -m app.accounts list

ACCOUNTS_FILE(JSON)에 아이디와 scrypt 해시만 저장한다. 비밀번호 원문은 어디에도 남기지 않는다.
"""
from __future__ import annotations

import argparse
import base64
import fcntl
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import config

LOGIN_ID_RE = re.compile(r"^[a-z0-9._-]{2,32}$")
MIN_PASSWORD_LENGTH = 6
MAX_PASSWORD_LENGTH = 200

# scrypt 설정 (표준 라이브러리). 해시 문자열에 함께 저장해서 나중에 바꿔도 옛 해시를 확인할 수 있다
SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN = 2**14, 8, 1, 32
# 없는 아이디도 같은 시간이 걸리게 비교할 가짜 해시
_DUMMY_HASH: str | None = None


class AccountError(Exception):
    pass


def normalize_login_id(raw: str) -> str:
    """앞뒤 공백을 지우고 소문자로 (CONTRACT 5-2)."""
    return (raw or "").strip().lower()


# ---- 해시 ---------------------------------------------------------------------

def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_DKLEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(dk)}"


def check_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, expected = stored.split("$")
        if algo != "scrypt":
            return False
        expected_b = base64.b64decode(expected)
        dk = hashlib.scrypt(password.encode()[:MAX_PASSWORD_LENGTH * 4], salt=base64.b64decode(salt),
                            n=int(n), r=int(r), p=int(p), dklen=len(expected_b))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk, expected_b)


def _dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_hex(16))
    return _DUMMY_HASH


# ---- 파일 ---------------------------------------------------------------------

def _path() -> Path:
    return Path(config.ACCOUNTS_FILE)


def _read() -> dict:
    path = _path()
    if not path.exists():
        return {"version": 1, "users": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("users", {})
    return data


def _write(data: dict) -> None:
    """임시 파일에 쓰고 rename → 중간에 죽어도 파일이 깨지지 않는다."""
    path = _path()
    fd, tmp = tempfile.mkstemp(prefix=".users.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


@contextmanager
def _locked():
    """관리 명령끼리 동시에 고쳐도 서로 덮어쓰지 않게."""
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.with_name(path.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


# ---- 계정 ---------------------------------------------------------------------

def _check_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AccountError(f"비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise AccountError(f"비밀번호는 {MAX_PASSWORD_LENGTH}자 이하여야 합니다")


def add_user(login_id: str, password: str) -> str:
    login_id = normalize_login_id(login_id)
    if not LOGIN_ID_RE.match(login_id):
        raise AccountError("아이디는 영어 소문자 · 숫자 · . _ - 로 2~32자여야 합니다")
    _check_new_password(password)
    with _locked():
        data = _read()
        if login_id in data["users"]:
            raise AccountError(f"이미 있는 아이디입니다: {login_id}")
        data["users"][login_id] = {
            "hash": hash_password(password),
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        _write(data)
    return login_id


def set_password(login_id: str, password: str) -> str:
    login_id = normalize_login_id(login_id)
    _check_new_password(password)
    with _locked():
        data = _read()
        if login_id not in data["users"]:
            raise AccountError(f"없는 아이디입니다: {login_id}")
        data["users"][login_id]["hash"] = hash_password(password)
        data["users"][login_id]["passwordChangedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        _write(data)
    return login_id


def remove_user(login_id: str) -> str:
    login_id = normalize_login_id(login_id)
    with _locked():
        data = _read()
        if data["users"].pop(login_id, None) is None:
            raise AccountError(f"없는 아이디입니다: {login_id}")
        _write(data)
    return login_id


def list_users() -> list[dict]:
    return [{"loginId": k, "createdAt": v.get("createdAt", "")}
            for k, v in sorted(_read()["users"].items())]


def user_exists(login_id: str) -> bool:
    return normalize_login_id(login_id) in _read()["users"]


def verify(login_id: str, password: str) -> str | None:
    """맞으면 정규화한 아이디, 아니면 None. 없는 아이디도 같은 계산을 해서 시간으로 구분되지 않게."""
    login_id = normalize_login_id(login_id)
    user = _read()["users"].get(login_id)
    stored = user["hash"] if user else _dummy_hash()
    ok = check_password(password or "", stored)
    return login_id if (user and ok) else None


# ---- 관리 명령 ----------------------------------------------------------------

def _ask_password() -> str:
    first = getpass.getpass("새 비밀번호: ")
    second = getpass.getpass("한 번 더: ")
    if first != second:
        raise AccountError("두 비밀번호가 다릅니다")
    return first


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.accounts", description="로그인 계정 관리 (결정 55)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name, help_ in (("add", "계정 만들기"), ("passwd", "비밀번호 바꾸기"), ("remove", "계정 지우기")):
        sub.add_parser(name, help=help_).add_argument("login_id", metavar="아이디")
    sub.add_parser("list", help="계정 목록 (비밀번호는 안 보임)")
    args = parser.parse_args(argv)
    try:
        if args.cmd == "add":
            print(f"만들었습니다: {add_user(args.login_id, _ask_password())}")
        elif args.cmd == "passwd":
            print(f"비밀번호를 바꿨습니다: {set_password(args.login_id, _ask_password())}")
        elif args.cmd == "remove":
            print(f"지웠습니다: {remove_user(args.login_id)}")
        else:
            users = list_users()
            for u in users:
                print(f"{u['loginId']}\t{u['createdAt']}")
            print(f"(모두 {len(users)}명)")
    except AccountError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
