"""환경 변수 설정 (docker-compose.yml x-app-env)."""
import os
from pathlib import Path

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
# 기본값은 실행 위치와 상관없이 backend/data (API · worker가 같은 곳을 보게). Docker는 /data
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parents[1] / "data")
FILE_TTL_HOURS = float(os.environ.get("FILE_TTL_HOURS", "24"))
FILE_TTL_SEC = int(FILE_TTL_HOURS * 3600)
MAX_DURATION_SEC = float(os.environ.get("MAX_DURATION_SEC", "1200"))  # 20분
TIMEZONE = os.environ.get("TZ", "Asia/Seoul") or "Asia/Seoul"

# 서버 과부하 방지 (PLAN 12장)
# 이 주소에서 온 요청만 X-Forwarded-For를 믿는다 (결정 50). 기본: 자기 자신 + Docker 내부망 대역
TRUSTED_PROXY_IPS = os.environ.get(
    "TRUSTED_PROXY_IPS", "127.0.0.1/32,::1/128,172.16.0.0/12,192.168.0.0/16"
)
RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "10"))
EXTRACT_TIMEOUT_SEC = int(os.environ.get("EXTRACT_TIMEOUT_SEC", "300"))
# 20분 × 20곡 + 잇기 + 소리 크기 = 이 Mac 176초 (B10). 느린 서버 · 작업 2개 동시 여유로 약 5배
EXPORT_TIMEOUT_SEC = int(os.environ.get("EXPORT_TIMEOUT_SEC", "900"))

TRACKS_DIR = DATA_DIR / "tracks"
EXPORTS_DIR = DATA_DIR / "exports"

# 파형 데이터 (CONTRACT 2-4)
PEAKS_PER_SECOND = 20
SAMPLE_RATE = 44100


def track_audio_path(track_id: str) -> Path:
    return TRACKS_DIR / f"{track_id}.mp3"


def track_peaks_path(track_id: str) -> Path:
    return TRACKS_DIR / f"{track_id}.peaks.json"


def export_path(export_id: str) -> Path:
    return EXPORTS_DIR / f"{export_id}.mp3"
