"""계정 저장 + 관리 명령 (결정 55)."""
import json
import os
import stat

import pytest

from app import accounts, config
from app.accounts import AccountError


def test_add_and_verify():
    assert accounts.add_user("  Grandma ", "비밀번호1234") == "grandma"
    assert accounts.verify("grandma", "비밀번호1234") == "grandma"
    assert accounts.verify(" GRANDMA  ", "비밀번호1234") == "grandma"   # 공백 · 대문자
    assert accounts.verify("grandma", "비밀번호123") is None
    assert accounts.verify("nobody", "비밀번호1234") is None
    assert accounts.verify("grandma", "") is None


def test_file_has_only_hash_and_is_private():
    accounts.add_user("grandma", "secret-pass")
    path = config.ACCOUNTS_FILE
    raw = path.read_text()
    assert "secret-pass" not in raw
    data = json.loads(raw)
    h = data["users"]["grandma"]["hash"]
    assert h.startswith("scrypt$16384$8$1$")
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert not [p for p in path.parent.iterdir() if p.name.endswith(".tmp")]


def test_same_password_different_salt():
    accounts.add_user("a1", "same-pass")
    accounts.add_user("b1", "same-pass")
    users = json.loads(config.ACCOUNTS_FILE.read_text())["users"]
    assert users["a1"]["hash"] != users["b1"]["hash"]


@pytest.mark.parametrize("bad", ["a", "x" * 33, "할머니", "a b", "a/b", "../x", ""])
def test_invalid_login_id(bad):
    with pytest.raises(AccountError):
        accounts.add_user(bad, "secret-pass")


def test_short_password_and_duplicate():
    with pytest.raises(AccountError):
        accounts.add_user("grandma", "12345")
    accounts.add_user("grandma", "secret-pass")
    with pytest.raises(AccountError):
        accounts.add_user("GRANDMA", "other-pass")


def test_passwd_and_remove():
    accounts.add_user("grandma", "old-pass")
    accounts.set_password("Grandma", "new-pass")
    assert accounts.verify("grandma", "old-pass") is None
    assert accounts.verify("grandma", "new-pass") == "grandma"
    accounts.remove_user("grandma")
    assert accounts.verify("grandma", "new-pass") is None
    with pytest.raises(AccountError):
        accounts.remove_user("grandma")
    with pytest.raises(AccountError):
        accounts.set_password("grandma", "whatever1")


def test_no_file_means_no_users():
    assert not config.ACCOUNTS_FILE.exists()
    assert accounts.list_users() == []
    assert accounts.verify("grandma", "x") is None


def test_corrupt_hash_rejected():
    accounts.add_user("grandma", "secret-pass")
    data = json.loads(config.ACCOUNTS_FILE.read_text())
    data["users"]["grandma"]["hash"] = "garbage"
    config.ACCOUNTS_FILE.write_text(json.dumps(data))
    assert accounts.verify("grandma", "secret-pass") is None


# ---- 관리 명령 ----------------------------------------------------------------

def _answers(monkeypatch, *values):
    it = iter(values)
    monkeypatch.setattr(accounts.getpass, "getpass", lambda prompt="": next(it))


def test_cli_add_list_passwd_remove(monkeypatch, capsys):
    _answers(monkeypatch, "secret-pass", "secret-pass")
    assert accounts.main(["add", "Grandma"]) == 0
    assert "만들었습니다: grandma" in capsys.readouterr().out

    assert accounts.main(["list"]) == 0
    out = capsys.readouterr().out
    assert "grandma" in out and "(모두 1명)" in out
    assert "scrypt" not in out and "secret-pass" not in out

    _answers(monkeypatch, "new-pass-1", "new-pass-1")
    assert accounts.main(["passwd", "grandma"]) == 0
    assert accounts.verify("grandma", "new-pass-1") == "grandma"

    assert accounts.main(["remove", "grandma"]) == 0
    assert accounts.list_users() == []


def test_cli_password_mismatch(monkeypatch, capsys):
    _answers(monkeypatch, "secret-pass", "secret-pas")
    assert accounts.main(["add", "grandma"]) == 1
    assert "두 비밀번호가 다릅니다" in capsys.readouterr().err
    assert accounts.list_users() == []


def test_cli_errors_exit_1(monkeypatch, capsys):
    assert accounts.main(["remove", "nobody"]) == 1
    assert "없는 아이디" in capsys.readouterr().err
