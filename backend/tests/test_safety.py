"""안전장치 (PLAN 12장)."""
import ast
from pathlib import Path

from app import config

ROOT = Path(__file__).resolve().parents[2]
VID = "dQw4w9WgXcQ"


def test_rate_limit_tracks(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 3)
    codes = [client.post("/tracks", json={"url": f"https://youtu.be/{VID}"}).status_code
             for _ in range(4)]
    assert codes == [202, 202, 202, 429]
    res = client.post("/tracks", json={"url": f"https://youtu.be/{VID}"})
    assert res.json() == {"error": {"code": "RATE_LIMITED",
                                    "message": "요청이 너무 많아요. 잠시 후 다시 시도해 주세요."}}


def test_rate_limit_counts_bad_requests_and_is_per_path(client, monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 2)
    for _ in range(2):
        client.post("/tracks", json={"url": "nope"})
    assert client.post("/tracks", json={"url": f"https://youtu.be/{VID}"}).status_code == 429
    # 다른 경로는 따로 센다
    assert client.post("/exports", json={}).status_code == 422
    # 조회는 제한 없음
    assert client.get("/jobs/j_x").status_code == 404


def test_rate_limit_window_expires(client, monkeypatch, fake_redis):
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", 1)
    client.post("/tracks", json={"url": f"https://youtu.be/{VID}"})
    assert client.post("/tracks", json={"url": f"https://youtu.be/{VID}"}).status_code == 429
    for key in fake_redis.scan_iter("rl:*"):
        assert 0 < fake_redis.ttl(key) <= 60
        fake_redis.delete(key)  # 창이 지난 것처럼
    assert client.post("/tracks", json={"url": f"https://youtu.be/{VID}"}).status_code == 202


def _python_files():
    for folder in ("backend/app", "worker"):
        yield from (ROOT / folder).rglob("*.py")


def test_no_shell_true_anywhere():
    """subprocess는 인자 리스트로만 (shell=True · os.system · os.popen 금지)."""
    bad = []
    for path in _python_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                for kw in node.keywords:
                    if kw.arg == "shell" and not (isinstance(kw.value, ast.Constant) and kw.value.value is False):
                        bad.append(f"{path}:{node.lineno} shell=")
                f = node.func
                if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) \
                        and f.value.id == "os" and f.attr in ("system", "popen"):
                    bad.append(f"{path}:{node.lineno} os.{f.attr}")
                # subprocess.*의 첫 인자가 문자열이면 금지
                if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) \
                        and f.value.id == "subprocess" and node.args \
                        and isinstance(node.args[0], (ast.Constant, ast.JoinedStr)):
                    bad.append(f"{path}:{node.lineno} 문자열 명령")
    assert bad == []


def test_task_timeouts_set():
    from worker.tasks import export, extract
    assert extract.extract_track.soft_time_limit == config.EXTRACT_TIMEOUT_SEC
    assert export.render_export.soft_time_limit == config.EXPORT_TIMEOUT_SEC
    assert extract.extract_track.time_limit > extract.extract_track.soft_time_limit
    assert export.render_export.time_limit > export.render_export.soft_time_limit
