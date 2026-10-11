# backend · worker

쉬운 음악 만들기의 API 서버(FastAPI)와 작업자(Celery). 기능 · 계약은 [`docs/PLAN.md`](../docs/PLAN.md), [`docs/CONTRACT.md`](../docs/CONTRACT.md)가 기준이다.

```
backend/app/
  main.py            FastAPI 앱 (라우터 · 에러 핸들러 연결)
  routers/           tracks.py (POST /tracks, audio, peaks) · jobs.py · exports.py
  schemas.py         요청 모양 (Edit JSON, camelCase alias)
  youtube.py         유튜브 주소 검사 → 표준 주소로 재구성
  ffmpeg_builder.py  Edit JSON → ffmpeg filter_complex · 인자 리스트 (PLAN 10장)
  store.py           Redis 기록 (작업 · 노래 · 내보내기, 24시간 TTL) · 요청 수 제한
  error_codes.py     에러 코드 · 문구 (fastapi 없음 — worker도 사용)
  errors.py          FastAPI 에러 핸들러 (CONTRACT 4장 형식)
  ratelimit.py       IP당 요청 수 제한 → 429
  queue.py           Celery 작업 이름 · 보내기 (API는 worker 코드를 import하지 않음)
  config.py          환경 변수
worker/
  celery_app.py      Celery 앱 + beat 일정
  media.py           ffmpeg · ffprobe 호출 (변환, 길이, 파형)
  tasks/             extract.py (추출) · export.py (렌더링) · cleanup.py (24시간 정리)
```

worker는 `backend/app`의 `config` · `store` · `ffmpeg_builder` · `error_codes`를 함께 쓴다 (그래서 Dockerfile build context가 레포 루트).

## Docker로 실행

> (아직 실기 확인 전 — Docker 있는 PC 필요)

```bash
docker compose up --build        # 레포 루트에서. api :8000, worker(+beat), redis :6379
```

## 로컬 실행 (Docker 없이, macOS)

처음 한 번:

```bash
brew install redis ffmpeg
python3 -m venv .venv                                   # 레포 루트에 만든다
.venv/bin/pip install -r backend/requirements-dev.txt   # API + worker + 테스트 도구
```

터미널 3개, **레포 루트에서**:

```bash
# 1) Redis
redis-server

# 2) API  → http://localhost:8000/docs
.venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000

# 3) 작업자 + beat
PYTHONPATH=backend:. .venv/bin/celery -A worker.celery_app worker -B \
  --pool=solo --loglevel=info --schedule=/tmp/celerybeat-schedule
```

- `--pool=solo`: Python 3.14에서는 Celery 기본 prefork 풀이 billiard 오류(`not enough values to unpack`)로 작업을 받자마자 죽는다. 로컬에서는 solo로 실행한다. 단, solo에서는 작업 타임아웃(`soft_time_limit`)이 동작하지 않는다. Docker 이미지(Python 3.12)는 prefork 그대로.
- 파일은 기본으로 `backend/data/`에 쌓인다 (git 제외). API와 worker가 같은 곳을 보도록 `DATA_DIR`을 바꿀 때는 둘 다 같은 값으로.
- 프론트 개발 서버는 `/api/*`를 `:8000`으로 넘긴다 (CONTRACT 0장).

빠른 확인:

```bash
curl -s -XPOST localhost:8000/tracks -H 'content-type: application/json' \
  -d '{"url":"https://youtu.be/jNQXAC9IVRw"}'
# → {"jobId":"j_…","trackId":"t_…"}
curl -s localhost:8000/jobs/<jobId>
```

## 환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Celery 브로커 + 작업 기록 저장소 |
| `DATA_DIR` | `backend/data` (Docker: `/data`) | 추출 파일(`tracks/`) · 결과 파일(`exports/`) |
| `FILE_TTL_HOURS` | `24` | 파일 · 기록 보관 시간 (지나면 삭제) |
| `MAX_DURATION_SEC` | `1200` | 이보다 긴 영상은 `TOO_LONG` (20분) |
| `TZ` | `Asia/Seoul` | 결과 파일 이름 `내 노래_MMDD.mp3`의 날짜 기준 |
| `RATE_LIMIT_PER_MINUTE` | `10` | IP · 경로별 분당 `POST /tracks`, `POST /exports` 수 (넘으면 429) |
| `EXTRACT_TIMEOUT_SEC` | `300` | 추출 작업 제한 시간 (넘으면 `TIMEOUT`) |
| `EXPORT_TIMEOUT_SEC` | `600` | 렌더링 작업 제한 시간 (넘으면 `TIMEOUT`) |

## 테스트

```bash
cd backend && ../.venv/bin/pytest        # backend/tests + worker/tests
```

- Redis는 `fakeredis`로 대신하므로 redis-server가 없어도 된다.
- ffmpeg가 있으면 실제 변환 · 렌더링 테스트까지 돈다 (없으면 그 테스트만 건너뜀).
- yt-dlp는 가짜로 바꿔서 테스트한다 → 유튜브 접속 없이 돈다. 실제 유튜브 확인은 위 "빠른 확인"으로.

## 안전장치 (PLAN 12장)

| 항목 | 구현 |
|---|---|
| 유튜브만 | `youtube.py` — 허용 호스트 5개, 영상 ID를 뽑아 `https://www.youtube.com/watch?v=<ID>`로 다시 만들어 yt-dlp에 전달 |
| 재생목록 · 긴 영상 | `/playlist` 거절, `noplaylist`, 20분 초과 `TOO_LONG` |
| 명령어 주입 | subprocess는 인자 리스트로만 (`test_safety.py`가 `shell=True` · `os.system` · 문자열 명령을 찾으면 실패) |
| 과부하 | IP당 요청 수 제한, 작업 타임아웃 |
| 저장 공간 | beat가 30분마다 24시간 지난 파일 삭제, Redis 기록은 TTL 24시간 |
