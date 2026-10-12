"""환경 변수 설정 (docker-compose.yml x-app-env)."""
import os
from pathlib import Path


def env_flag(name: str, default: bool = False) -> bool:
    """"1" · "true" · "yes"(대소문자 무관)면 True."""
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes")


def _default_app_home() -> Path:
    """데스크톱 데이터 폴더 (결정 67): 윈도우 %LOCALAPPDATA%\\EasyMusic, 개발용 Mac은 Application Support."""
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "EasyMusic"
    return Path.home() / "Library" / "Application Support" / "EasyMusic"


# 데스크톱 모드 (결정 66, CONTRACT 7장): Celery · Redis 없이 한 프로세스 안에서
DESKTOP = env_flag("DESKTOP")
APP_HOME = Path(os.environ.get("EASYMUSIC_HOME") or _default_app_home())
DESKTOP_PORT = int(os.environ.get("DESKTOP_PORT", "47821"))
DESKTOP_KEY = os.environ.get("DESKTOP_KEY", "")  # 실행기가 실행할 때마다 무작위로 넣는다 (결정 69)
# 화면 파일(vite build 결과). 데스크톱에서 FastAPI가 `/`로 제공
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST") or Path(__file__).resolve().parents[2] / "frontend" / "dist")
# 저장 위치 (결정 71). 비워 두면 윈도우 "다운로드" 알려진 폴더 / 그 밖은 ~/Downloads
DOWNLOADS_DIR = os.environ.get("EASYMUSIC_DOWNLOADS", "")
DESKTOP_EXTRACT_WORKERS = 2
DESKTOP_EXPORT_WORKERS = 1

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
# 기본값은 실행 위치와 상관없이 backend/data (API · worker가 같은 곳을 보게). Docker는 /data,
# 데스크톱은 APP_HOME/data
DATA_DIR = Path(os.environ.get("DATA_DIR") or (APP_HOME / "data" if DESKTOP else Path(__file__).resolve().parents[1] / "data"))
# 로그인 계정 (결정 55). 24시간 정리 대상 아님. Docker: /accounts/users.json
ACCOUNTS_FILE = Path(os.environ.get("ACCOUNTS_FILE") or Path(__file__).resolve().parents[1] / "accounts" / "users.json")
# API 자동 문서(/docs · /redoc · /openapi.json). 기본 끔, 개발할 때만 true (결정 62)
API_DOCS = env_flag("API_DOCS")

# 로그인 세션 (결정 56 · 58)
COOKIE_SECURE = env_flag("COOKIE_SECURE")
SESSION_TTL_SEC = 30 * 24 * 3600
LOGIN_FAIL_WINDOW_SEC = 15 * 60
LOGIN_FAIL_LIMIT_ID = 5
LOGIN_FAIL_LIMIT_IP = 20
FILE_TTL_HOURS = float(os.environ.get("FILE_TTL_HOURS", "24"))
FILE_TTL_SEC = int(FILE_TTL_HOURS * 3600)
MAX_DURATION_SEC = float(os.environ.get("MAX_DURATION_SEC", "1200"))  # 20분
TIMEZONE = os.environ.get("TZ", "Asia/Seoul") or "Asia/Seoul"

# 서버 과부하 방지 (PLAN 12장)
# 이 주소에서 온 요청만 X-Forwarded-For를 믿는다 (결정 50). 기본: 자기 자신 + Docker 내부망 대역
TRUSTED_PROXY_IPS = os.environ.get(
    "TRUSTED_PROXY_IPS", "127.0.0.1/32,::1/128,172.16.0.0/12,192.168.0.0/16"
)
# IP당 지난 24시간 동안 POST /tracks로 받을 수 있는 노래 수 (결정 52). 0이면 끔
DAILY_TRACK_LIMIT = int(os.environ.get("DAILY_TRACK_LIMIT", "100"))
RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "10"))
EXTRACT_TIMEOUT_SEC = int(os.environ.get("EXTRACT_TIMEOUT_SEC", "300"))
# 20분 × 20곡 + 잇기 + 소리 크기 = 이 Mac 176초 (B10). 느린 서버 · 작업 2개 동시 여유로 약 5배
EXPORT_TIMEOUT_SEC = int(os.environ.get("EXPORT_TIMEOUT_SEC", "900"))

TRACKS_DIR = DATA_DIR / "tracks"
EXPORTS_DIR = DATA_DIR / "exports"
META_DIR = DATA_DIR / "meta"  # 데스크톱: 작업 · 노래 · 내보내기 기록 파일 (Redis 대신)

# 파형 데이터 (CONTRACT 2-4)
PEAKS_PER_SECOND = 20
SAMPLE_RATE = 44100


def track_audio_path(track_id: str) -> Path:
    return TRACKS_DIR / f"{track_id}.mp3"


def track_peaks_path(track_id: str) -> Path:
    return TRACKS_DIR / f"{track_id}.peaks.json"


def export_path(export_id: str) -> Path:
    return EXPORTS_DIR / f"{export_id}.mp3"
