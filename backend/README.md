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

서버에 올릴 때는 아래 "서버 1대 배포 점검 목록"을 먼저 본다.

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
.venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000 --no-proxy-headers

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
| `TRUSTED_PROXY_IPS` | `127.0.0.1/32,::1/128,172.16.0.0/12,192.168.0.0/16` | 이 주소(쉼표로 구분한 IP · 대역)에서 온 요청만 `X-Forwarded-For` 맨 오른쪽 값을 사용자 IP로 믿음. 그 밖은 접속 IP (결정 50) |
| `DAILY_TRACK_LIMIT` | `100` | IP당 지난 24시간 동안 `POST /tracks`로 받을 수 있는 노래 수. 넘으면 429 (결정 52). `0`이면 끔 |
| `RATE_LIMIT_PER_MINUTE` | `10` | IP · 경로별 분당 `POST /tracks`, `POST /exports` 수 (넘으면 429) |
| `EXTRACT_TIMEOUT_SEC` | `300` | 추출 작업 제한 시간 (넘으면 `TIMEOUT`) |
| `EXPORT_TIMEOUT_SEC` | `900` | 렌더링 작업 제한 시간 (넘으면 `TIMEOUT`). 최악 경우(20분 × 20곡) 실측 176초 |

## 테스트

```bash
cd backend && ../.venv/bin/pytest        # backend/tests + worker/tests
```

- Redis는 `fakeredis`로 대신하므로 redis-server가 없어도 된다.
- ffmpeg가 있으면 실제 변환 · 렌더링 테스트까지 돈다 (없으면 그 테스트만 건너뜀).
- yt-dlp는 가짜로 바꿔서 테스트한다 → 유튜브 접속 없이 돈다. 실제 유튜브 확인은 위 "빠른 확인"으로.
- 느린 측정 테스트는 기본 실행에서 빠진다. 최악 경우 렌더링(20분 × 20곡, 약 3분):
  `../.venv/bin/pytest -m slow -s tests/test_render_worst_case.py` (작게: `WORST_TRACKS=4 WORST_MINUTES=5` 앞에 붙이기)

## 서버 1대 배포 점검 목록 (결정 49)

> 배포 대상 · 공개 범위는 GitHub 이슈 #1에서 확인 중. 이 목록은 **준비용**이고, 실제 배포 · 외부 서비스 설정은 그 답이 나온 뒤에 한다.

구성: `docker compose up -d --build` 한 벌 = `web`(nginx, 사용자가 접속) · `api` · `worker`(+beat) · `redis`. 파일은 `media` 볼륨(`/data`).

### 필요한 자원 (실측 근거)

| 항목 | 권장 | 근거 |
|---|---|---|
| CPU | **4 vCPU** (최소 2) | worker `--concurrency=2` = 추출 · 저장 2개 동시. 렌더링은 ffmpeg 한 개(거의 한 코어), 소리 크기 측정은 곡마다 최대 4개 동시. 최악 저장(20분 × 20곡 + 잇기 + 소리 크기) **176초**(M2 Pro, B10) — 서버 CPU는 2~3배 느릴 수 있음 → `EXPORT_TIMEOUT_SEC=900` |
| 메모리 | **4GB** (최소 2GB) | 렌더링 ffmpeg 최대 **64MB**(B10), 20분 곡 추출(변환 + 파형) 최대 **약 150MB**, celery 프로세스 하나 약 30~100MB, redis · nginx 작음 |
| 디스크 | **40GB 이상** + 사용량 알림 | 이미지 약 1.5GB. 20분 곡 하나 = mp3 약 **29MB**(4분 곡 약 6MB). 최악 저장 1건 = 원곡 576MB + 결과 575MB = **1.15GB**. 모두 24시간 뒤 삭제 → "하루 동안 쌓이는 양"만큼 필요 |

- 디스크 남용 방지: `POST /tracks`는 IP당 **하루(지난 24시간) 100곡**까지(`DAILY_TRACK_LIMIT`, 결정 52). 한 사람이 쌓을 수 있는 원곡은 최대 약 2.9GB(20분 곡 100개)이고 24시간 뒤 삭제된다. 그래도 많은 사람이 동시에 쓰면 쌓이므로 디스크 사용량 알림은 걸어 둔다.

### 배포 전 확인

- [ ] 바깥에 여는 포트는 `web`(compose `8080:80`) **하나뿐**. `api`(8000) · `redis`(6379)는 `127.0.0.1`에만 묶여 있는지 (`docker compose ps`). 비밀번호 없는 Redis · X-Forwarded-For 위조 방지(B12)
- [ ] HTTPS: compose에는 TLS가 없다 → 서버 앞단(로드밸런서 · 리버스 프록시)에서 처리. 앞단을 하나 더 두면 그 주소 대역을 `TRUSTED_PROXY_IPS`에 넣어야 하고, 지금 구현은 X-Forwarded-For **한 단계**만 보므로 다시 검토 필요
- [ ] 환경 변수(위 표): 보통은 compose 기본값 그대로. `TZ=Asia/Seoul`(파일 이름 날짜), `EXPORT_TIMEOUT_SEC=900`, `MAX_DURATION_SEC=1200`
- [ ] `docker compose logs worker | grep "yt-dlp "` 로 yt-dlp 버전 확인, 실제 유튜브 주소 하나로 ① → ⑦ 한 번 끝까지
- [ ] `curl -s http://localhost:8000/health` → `{"ok":true}` (서버 안에서)
- [ ] 24시간 정리: worker 로그에 30분마다 `cleanup_files` 실행 (`docker compose logs worker | grep cleanup`)

### 백업 · 운영

- **백업 필요 없음**: `media` 볼륨과 Redis의 작업 기록은 모두 24시간짜리 임시 데이터다. 서버가 날아가도 사용자는 처음부터 다시 하면 된다 (브라우저 이어서 하기는 23시간 안 · 서버 파일이 있을 때만).
- Redis는 영속 저장이 필요 없다 (재시작하면 진행 중이던 작업만 사라짐).
- 업데이트: `git pull && docker compose up -d --build`. 진행 중인 추출 · 저장은 실패로 끝나고 사용자가 다시 시도하면 된다.
- yt-dlp 고장: 아래 절차.
- 유튜브가 서버 IP를 막을 수 있다(PLAN 14장 리스크) — 증상은 yt-dlp 고장과 비슷("Sign in to confirm you're not a bot"). yt-dlp를 올려도 계속되면 IP 차단을 의심.

## yt-dlp가 고장 나면 (결정 51)

유튜브가 바뀌면 yt-dlp가 자주 고장 난다. 그래서 `worker/requirements.txt`는 yt-dlp **하한만** 고정하고, worker 이미지를 빌드할 때마다 최신을 받는다.

증상: ② 불러오는 중에서 "노래를 가져오지 못했어요. 잠시 후 다시 시도해 주세요."(`EXTRACT_FAILED`)가 여러 영상에서 계속 나옴. worker 로그에 `ERROR: [youtube] ...`.

1. 지금 버전 확인 — worker가 뜰 때 로그 첫머리에 `yt-dlp 2026.xx.xx`가 찍힌다.
   ```bash
   docker compose logs worker | grep "yt-dlp "
   ```
2. 새로 빌드해서 다시 띄우기 (작업 중인 추출 · 저장은 실패하고, 사용자는 다시 시도하면 됨)
   ```bash
   docker compose build --pull worker && docker compose up -d worker
   ```
   `worker/Dockerfile`이 PyPI의 yt-dlp 정보를 받아 오므로, 새 버전이 나와 있으면 캐시와 상관없이 yt-dlp만 새로 받는다 (새 버전이 없으면 캐시 그대로라 빠름).
3. 그래도 안 되면: 아직 고친 버전이 안 나온 것. [yt-dlp 이슈](https://github.com/yt-dlp/yt-dlp/issues)에서 같은 증상을 찾고, 고친 버전이 나오면 2번을 다시. 이슈에 "deno를 올려라"가 있으면 `worker/Dockerfile`의 `denoland/deno:bin-…` 태그를 올린다.

로컬(Docker 없이)에서는 `.venv/bin/pip install -U "yt-dlp[default]"` 후 worker를 다시 띄운다.

## 안전장치 (PLAN 12장)

| 항목 | 구현 |
|---|---|
| 유튜브만 | `youtube.py` — 허용 호스트 5개, 영상 ID를 뽑아 `https://www.youtube.com/watch?v=<ID>`로 다시 만들어 yt-dlp에 전달 |
| 재생목록 · 긴 영상 | `/playlist` 거절, `noplaylist`, 20분 초과 `TOO_LONG` |
| 명령어 주입 | subprocess는 인자 리스트로만 (`test_safety.py`가 `shell=True` · `os.system` · 문자열 명령을 찾으면 실패) |
| 과부하 | IP당 요청 수 제한(분당 10번, 노래 불러오기는 하루 100곡 — 프록시는 `TRUSTED_PROXY_IPS`만 믿음 — `X-Forwarded-For` 위조 방지), 작업 타임아웃 |
| 저장 공간 | beat가 30분마다 24시간 지난 파일 삭제, Redis 기록은 TTL 24시간 |
