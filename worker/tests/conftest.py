import shutil

import fakeredis
import pytest

from app import config, store

needs_ffmpeg = pytest.mark.skipif(
    not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="ffmpeg 없음"
)


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch, tmp_path):
    r = fakeredis.FakeRedis(decode_responses=True)
    store.set_redis(r)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "TRACKS_DIR", tmp_path / "tracks")
    monkeypatch.setattr(config, "EXPORTS_DIR", tmp_path / "exports")
    monkeypatch.setattr(config, "ACCOUNTS_FILE", tmp_path / "accounts" / "users.json")
    yield r
    store.set_redis(None)


def make_tone(path, seconds: float, freq: int = 440, rate: int = 48000, channels: int = 1):
    """테스트용 사인파 파일 (원본 포맷을 일부러 48kHz 모노로)."""
    import subprocess
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y",
         "-f", "lavfi", "-i", f"sine=frequency={freq}:sample_rate={rate}:duration={seconds}",
         "-ac", str(channels), str(path)],
        check=True,
    )
    return path
