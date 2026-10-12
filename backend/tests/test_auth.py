"""로그인 API · 세션 (CONTRACT 5장, 결정 56 · 58)."""
import pytest
from fastapi.testclient import TestClient

from app import accounts, config, sessions
from app.main import app

PW = "secret-pass"


@pytest.fixture
def user():
    accounts.add_user("grandma", PW)
    return "grandma"


def _client(peer="203.0.113.7"):
    return TestClient(app, client=(peer, 50000), raise_server_exceptions=False)


def _login(c, login_id="grandma", password=PW):
    return c.post("/auth/login", json={"loginId": login_id, "password": password})


def test_login_me_logout(user, fake_redis):
    c = _client()
    res = _login(c, "  Grandma ")
    assert res.status_code == 200
    assert res.json() == {"user": {"loginId": "grandma"}}
    cookie = res.headers["set-cookie"]
    assert cookie.startswith("em_session=")
    low = cookie.lower()
    assert "httponly" in low and "samesite=lax" in low and "path=/" in low
    assert "max-age=2592000" in low and "secure" not in low   # COOKIE_SECURE 기본 false

    assert c.get("/auth/me").json() == {"user": {"loginId": "grandma"}, "desktop": False}  # CONTRACT 7-2
    # Redis에는 토큰 원문이 아니라 해시만
    token = c.cookies.get("em_session")
    assert not any(token in k for k in fake_redis.scan_iter("*"))

    res = c.post("/auth/logout")
    assert res.status_code == 204 and res.content == b""
    assert "em_session=" in res.headers["set-cookie"] and "max-age=0" in res.headers["set-cookie"].lower()
    c.cookies.set("em_session", token)          # 지운 쿠키를 다시 보내도
    assert c.get("/auth/me").status_code == 401


def test_secure_cookie_when_configured(user, monkeypatch):
    monkeypatch.setattr(config, "COOKIE_SECURE", True)
    res = _login(_client())
    assert "secure" in res.headers["set-cookie"].lower()


def test_me_without_login():
    res = _client().get("/auth/me")
    assert res.status_code == 401
    assert res.json() == {"error": {"code": "UNAUTHORIZED", "message": "로그인이 필요해요. 다시 로그인해 주세요."}}


def test_garbage_cookie():
    c = _client()
    c.cookies.set("em_session", "x" * 500)
    assert c.get("/auth/me").status_code == 401


def test_logout_without_login_is_204():
    assert _client().post("/auth/logout").status_code == 204


@pytest.mark.parametrize("login_id,password", [("grandma", "wrong-pass"), ("nobody", PW)])
def test_login_failed_same_answer(user, login_id, password):
    res = _login(_client(), login_id, password)
    assert res.status_code == 401
    assert res.json() == {"error": {"code": "LOGIN_FAILED",
                                    "message": "아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요."}}
    assert "set-cookie" not in res.headers


@pytest.mark.parametrize("body", [{}, {"loginId": "grandma"}, {"loginId": 1, "password": 2}, {"loginId": "a", "password": "x" * 300}])
def test_bad_login_body(user, body):
    res = _client().post("/auth/login", json=body)
    assert res.status_code == 401 and res.json()["error"]["code"] == "LOGIN_FAILED"


def test_lock_after_5_wrong_for_same_id(user):
    c = _client()
    for _ in range(5):
        assert _login(c, password="wrong-pass").status_code == 401
    res = _login(c)                                  # 맞는 비밀번호여도 15분 막힘
    assert res.status_code == 429
    assert res.json()["error"] == {"code": "LOGIN_LOCKED", "message": "여러 번 틀려서 잠시 막혔어요. 15분 뒤에 다시 해 주세요."}
    assert _login(_client("198.51.100.9")).status_code == 429   # 다른 IP에서도 그 아이디는 막힘


def test_lock_expires(user, fake_redis):
    c = _client()
    for _ in range(5):
        _login(c, password="wrong-pass")
    ttl = fake_redis.ttl("loginlock:id:grandma")
    assert 15 * 60 - 5 < ttl <= 15 * 60
    fake_redis.delete("loginlock:id:grandma")       # 15분 지난 것처럼
    assert _login(c).status_code == 200


def test_success_resets_id_counter(user):
    c = _client()
    for _ in range(4):
        _login(c, password="wrong-pass")
    assert _login(c).status_code == 200
    for _ in range(4):
        assert _login(c, password="wrong-pass").status_code == 401
    assert _login(c).status_code == 200


def test_lock_after_20_wrong_from_same_ip(user):
    accounts.add_user("grandpa", PW)
    c = _client("203.0.113.20")
    for i in range(20):                              # 아이디를 바꿔 가며 (아이디당 4번 이하)
        assert _login(c, f"guess{i % 5}", "wrong-pass").status_code == 401
    assert _login(c, "grandpa").status_code == 429   # 이 IP는 막힘
    assert _login(_client("203.0.113.21"), "grandpa").status_code == 200


def test_unknown_id_counts_too(user):
    c = _client()
    for _ in range(5):
        _login(c, "ghost", "x")
    assert _login(c, "GHOST", "x").status_code == 429


def test_login_replaces_old_session(user):
    c = _client()
    _login(c)
    old = c.cookies.get("em_session")
    _login(c)
    new = c.cookies.get("em_session")
    assert old != new
    c2 = _client()
    c2.cookies.set("em_session", old)
    assert c2.get("/auth/me").status_code == 401


def test_session_slides_and_cookie_refreshed_daily(user, fake_redis):
    c = _client()
    _login(c)
    key = next(k for k in fake_redis.scan_iter("session:*"))
    fake_redis.expire(key, 10 * 24 * 3600)           # 20일 지난 것처럼
    res = c.get("/auth/me")
    assert fake_redis.ttl(key) > 29 * 24 * 3600      # 쓰면 다시 30일
    assert "max-age=2592000" in res.headers["set-cookie"].lower()
    res = c.get("/auth/me")                          # 방금 늘렸으니 이번엔 쿠키 안 보냄
    assert "set-cookie" not in res.headers


def test_removed_account_session_rejected(user):
    c = _client()
    _login(c)
    accounts.remove_user("grandma")                  # 파일에서 바로 지운 경우
    assert c.get("/auth/me").status_code == 401


def test_cli_passwd_and_remove_end_sessions(user, monkeypatch, capsys):
    c1, c2 = _client(), _client("198.51.100.4")
    _login(c1), _login(c2)
    it = iter(["new-pass-1", "new-pass-1"])
    monkeypatch.setattr(accounts.getpass, "getpass", lambda prompt="": next(it))
    assert accounts.main(["passwd", "grandma"]) == 0
    assert "로그인 2곳 끊음" in capsys.readouterr().out
    assert c1.get("/auth/me").status_code == 401 and c2.get("/auth/me").status_code == 401
    _login(c1, password="new-pass-1")
    assert accounts.main(["remove", "grandma"]) == 0
    assert "로그인 1곳 끊음" in capsys.readouterr().out
    assert c1.get("/auth/me").status_code == 401


def test_cli_without_redis_still_changes_account(user, monkeypatch, capsys):
    def boom(_):
        raise ConnectionError("no redis")
    monkeypatch.setattr(sessions, "delete_all_for", boom)
    assert accounts.main(["remove", "grandma"]) == 0
    assert "세션을 끊지 못함" in capsys.readouterr().out
    assert accounts.list_users() == []
