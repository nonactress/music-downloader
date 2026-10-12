"""API 자동 문서는 기본으로 끔, API_DOCS=true일 때만 (결정 62)."""
import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app, create_app

DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


def test_default_is_off():
    assert config.API_DOCS is False


@pytest.mark.parametrize("path", DOC_PATHS)
def test_docs_off_by_default(path):
    c = TestClient(app, raise_server_exceptions=False)
    res = c.get(path)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("path", DOC_PATHS)
def test_docs_on_when_enabled(path):
    c = TestClient(create_app(api_docs=True), raise_server_exceptions=False)
    assert c.get(path).status_code == 200


def test_env_turns_docs_on(monkeypatch):
    monkeypatch.setattr(config, "API_DOCS", True)
    c = TestClient(create_app(), raise_server_exceptions=False)
    assert c.get("/openapi.json").status_code == 200


def test_schema_still_built_internally_when_off():
    """문서를 꺼도 test_ownership의 OpenAPI 경로 순회는 그대로 돈다 (스키마는 내부에서 만들 수 있음)."""
    assert app.openapi_url is None
    paths = app.openapi()["paths"]
    assert "/tracks" in paths and "/auth/login" in paths and "/exports/{export_id}/download" in paths


@pytest.mark.parametrize("value,expected", [("true", True), ("1", True), (" YES ", True),
                                            ("false", False), ("", False), ("no", False), (None, False)])
def test_env_flag(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("API_DOCS", raising=False)
    else:
        monkeypatch.setenv("API_DOCS", value)
    assert config.env_flag("API_DOCS") is expected
