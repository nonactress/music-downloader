# CONTRACT — API · Edit JSON 계약 (v1)

> 작성 · 수정: **lead만**. 바꿔야 할 점이 있으면 공유 보드에 "계약 변경 요청: ..."으로 남긴다.
> 기준 문서: `docs/PLAN.md` 7~10장, 12장. 이 문서와 PLAN이 다르면 이 문서가 우선한다 (PLAN을 구체화한 것).

---

## 0. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 주소 | API 서버 `http://localhost:8000`, 경로에 접두사 없음 (`/tracks`, `/jobs/{id}` …) |
| 프론트 개발 서버 | Vite 프록시 `/api/*` → `http://localhost:8000/*` (접두사 `/api` 제거) |
| 형식 | 요청 · 응답 본문은 `application/json; charset=utf-8` (오디오 응답 제외) |
| 필드 이름 | **camelCase** (`sourceId`, `keepPitch`, `durationSec`). 백엔드는 pydantic alias로 맞춘다 |
| 시간 | 초 단위 `number` (소수 허용). 화면 표기 변환(`3분 45초`, `0:12`)은 프론트가 한다 |
| ID | 서버가 만드는 문자열 (예: `uuid4().hex`). 프론트는 모양을 가정하지 않는다 |
| `trackId` = `sourceId` | 추출된 노래 하나의 ID. Edit JSON의 `sourceId`에 그대로 넣는다 |
| 모르는 필드 | 서버는 요청의 모르는 필드를 **무시**한다 (에러 아님) |
| 보관 기간 | 추출 파일 · 결과 파일 · 작업 기록은 **24시간** 뒤 삭제 |
| 진행률 조회 | 프론트는 `GET /jobs/{id}`를 **1초마다** 호출, `done`/`failed`이면 멈춤 |
| 운영용 | `GET /health` → `200 {"ok": true}` (API 6개와 별개, 프론트는 쓰지 않음) |

---

## 1. 작업(Job) 상태

| `status` | 뜻 | `progress` | 다음 상태 |
|---|---|---|---|
| `queued` | 줄 서서 기다리는 중 | `0` | `running`, `failed` |
| `running` | 처리 중 | `0`~`99` | `done`, `failed` |
| `done` | 끝남, `result` 있음 | `100` | – (끝) |
| `failed` | 실패, `error` 있음 | 마지막 값 유지 | – (끝) |

- 상태값은 **이 4개만** 쓴다. 다른 값 금지.
- `progress`는 0~100 정수, 줄어들지 않는다.
- `etaSeconds`는 남은 시간(초, 정수). 모르면 `null` → 프론트는 남은 시간 문구를 숨긴다.

---

## 2. API (6개)

### 2-1. `POST /tracks` — 유튜브 주소로 추출 작업 시작

요청
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

응답 `202 Accepted`
```json
{ "jobId": "j_9f2c...", "trackId": "t_1a7b..." }
```

즉시 거절 (작업을 만들지 않음)

| 상황 | HTTP | `code` |
|---|---|---|
| 유튜브 주소 아님 (허용 호스트: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`) | 400 | `INVALID_URL` |
| 재생목록 주소 (`/playlist?list=...`) | 400 | `PLAYLIST_NOT_ALLOWED` |
| 요청이 너무 많음 | 429 | `RATE_LIMITED` |

- `watch?v=...&list=...`처럼 영상 ID가 있으면 **그 영상 하나만** 가져온다 (yt-dlp `--no-playlist`).
- 영상 길이 검사(20분 초과)는 작업 안에서 한다 → 작업이 `failed` + `TOO_LONG`.

### 2-2. `GET /jobs/{id}` — 진행률 · 상태 · 결과 조회

추출 작업 (`kind: "extract"`) — 진행 중
```json
{
  "jobId": "j_9f2c...",
  "kind": "extract",
  "status": "running",
  "progress": 60,
  "etaSeconds": 20,
  "track": {
    "trackId": "t_1a7b...",
    "title": "노래 제목",
    "channel": "채널 이름",
    "durationSec": 225.0,
    "thumbnailUrl": "https://i.ytimg.com/vi/.../hqdefault.jpg"
  },
  "result": null,
  "error": null
}
```

- `track`은 yt-dlp가 영상 정보를 읽은 뒤부터 채워진다. 그 전(`queued`, `running` 초반)에는 `null`.
- 추출 `done`일 때 `result`:
```json
"result": {
  "track": {
    "trackId": "t_1a7b...",
    "title": "노래 제목",
    "channel": "채널 이름",
    "durationSec": 224.83,
    "thumbnailUrl": "https://i.ytimg.com/vi/.../hqdefault.jpg"
  }
}
```
  - `durationSec`는 **변환된 실제 파일 길이**(ffprobe 값). 잘라내기 `end`의 최댓값이다.

내보내기 작업 (`kind: "export"`) — 끝남
```json
{
  "jobId": "j_77aa...",
  "kind": "export",
  "status": "done",
  "progress": 100,
  "etaSeconds": 0,
  "track": null,
  "result": {
    "exportId": "e_c3d4...",
    "fileName": "내 노래_1011.mp3",
    "trackCount": 2,
    "durationSec": 380.0,
    "sizeBytes": 6082560
  },
  "error": null
}
```

- `fileName` 규칙: `내 노래_MMDD.mp3` (서버 시각 Asia/Seoul 기준 월일).

실패 (공통)
```json
{
  "jobId": "j_9f2c...",
  "kind": "extract",
  "status": "failed",
  "progress": 35,
  "etaSeconds": null,
  "track": null,
  "result": null,
  "error": { "code": "TOO_LONG", "message": "20분이 넘는 영상은 가져올 수 없어요." }
}
```

| 상황 | HTTP |
|---|---|
| 없는 작업 / 24시간 지나 지워진 작업 | 404 `NOT_FOUND` |

### 2-3. `GET /tracks/{id}/audio` — 미리듣기용 오디오

- 응답 `200` (또는 `Range` 요청 시 `206`), `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`
- 내용: 추출 · 변환된 원곡 전체 (44.1kHz 스테레오 mp3). 편집 내용은 반영하지 않는다 — 미리듣기는 브라우저가 `start`/`end`/`playbackRate`로 처리.
- 없거나 지워졌으면 404 `NOT_FOUND`, 아직 추출 중이면 409 `NOT_READY`.

### 2-4. `GET /tracks/{id}/peaks` — 파형 데이터

응답 `200`
```json
{
  "trackId": "t_1a7b...",
  "durationSec": 224.83,
  "pointsPerSecond": 20,
  "peaks": [0.01, 0.12, 0.43, 0.38, 0.0]
}
```

- `peaks`: 모노로 합친 절댓값 최댓값, **0~1** 소수, 길이 = `ceil(durationSec × pointsPerSecond)`.
- wavesurfer.js에는 `peaks: [peaks]`, `duration: durationSec`로 넘긴다.
- 404 `NOT_FOUND` / 409 `NOT_READY`는 2-3과 같음.

### 2-5. `POST /exports` — 편집 JSON으로 렌더링 시작

요청: **Edit JSON** (3장) 그대로

응답 `202 Accepted`
```json
{ "jobId": "j_77aa...", "exportId": "e_c3d4..." }
```

| 상황 | HTTP | `code` |
|---|---|---|
| Edit JSON 규칙 위반 (3-2) | 422 | `INVALID_EDIT` |
| `sourceId`가 없거나 지워짐 | 404 | `NOT_FOUND` |
| `sourceId` 추출이 아직 안 끝남 | 409 | `NOT_READY` |
| 요청이 너무 많음 | 429 | `RATE_LIMITED` |

### 2-6. `GET /exports/{id}/download` — 완성된 mp3 받기

- 응답 `200`, `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`
- `Content-Disposition: attachment; filename="export.mp3"; filename*=UTF-8''%EB%82%B4%20%EB%85%B8%EB%9E%98_1011.mp3`
  (한글 파일 이름은 `filename*`, 영문 대체 이름은 `filename`)
- 저장 완료 화면의 [들어보기]도 이 주소를 `<audio src>`로 쓴다.
- 없거나 지워졌으면 404 `NOT_FOUND`, 렌더링이 안 끝났으면 409 `NOT_READY`.

---

## 3. Edit JSON

### 3-1. 모양

```json
{
  "tracks": [
    { "sourceId": "t_1a7b...", "start": 12.5, "end": 200.0, "speed": 1.0,  "keepPitch": true },
    { "sourceId": "t_88ef...", "start": 0,    "end": 240.0, "speed": 1.25, "keepPitch": true }
  ],
  "crossfade": 2,
  "normalize": true,
  "format": "mp3"
}
```

| 필드 | 타입 | 뜻 |
|---|---|---|
| `tracks` | array | 배열 순서 = 이어 붙이는 순서 (1번 노래가 맨 앞) |
| `tracks[].sourceId` | string | `POST /tracks`가 준 `trackId` |
| `tracks[].start` | number | 남길 부분 시작 (초, **원곡 기준**) |
| `tracks[].end` | number | 남길 부분 끝 (초, **원곡 기준**) |
| `tracks[].speed` | number | 빠르기 배수. 1.0 = 원래 빠르기 |
| `tracks[].keepPitch` | boolean | `true` = 목소리 높낮이 유지 (`atempo`), `false` = `asetrate` |
| `crossfade` | number | 노래 사이 부드럽게 잇기 길이(초). `0` = 끔 |
| `normalize` | boolean | 소리 크기 고르게 맞추기 (`loudnorm`) |
| `format` | string | `"mp3"`만 |

### 3-2. 검증 규칙 (서버가 422 `INVALID_EDIT`로 거절)

| 규칙 |
|---|
| `tracks` 1개 이상 **20개 이하** |
| `0 ≤ start < end ≤ durationSec` (원곡 실제 길이, 오차 0.05초 허용) |
| `end − start ≥ 1` (최소 1초 남김) |
| `0.5 ≤ speed ≤ 2.0` (ffmpeg `atempo` 한 번으로 처리 가능한 범위) |
| `0 ≤ crossfade ≤ 10` |
| 곡이 2개 이상이고 `crossfade > 0`이면, 모든 곡의 결과 길이 `(end − start) / speed`가 `crossfade`보다 길어야 함 (PLAN 10장) |
| `format == "mp3"` |

- 422 응답의 `error.message`는 사용자에게 보여줄 쉬운 문구, 개발용 상세는 `error.detail` (선택 필드)에 넣는다.

### 3-3. 기본값 (노래를 새로 불러왔을 때 프론트가 만드는 값)

| 필드 | 기본값 | 근거 |
|---|---|---|
| `start` | `0` | – |
| `end` | `durationSec` (추출 `result.track.durationSec`) | – |
| `speed` | `1.0` | 와이어프레임 "보통 빠르기" |
| `keepPitch` | `true` | PLAN 1장 "기본 ON", 와이어프레임 체크됨 |
| `crossfade` | `2` (체크 켜짐) / `0` (체크 끔) | PLAN 1장 "기본 2초", Edit.html 체크됨 |
| `normalize` | `true` | Edit.html 체크됨 |
| `format` | `"mp3"` | – |

### 3-4. 편집 규칙 (프론트)

- 결과 길이 = Σ `(end − start) / speed` − `crossfade × (곡 수 − 1)` (crossfade > 0일 때)
- "모든 노래 빠르기"는 모든 `tracks[].speed`(와 `keepPitch`)를 같은 값으로 **덮어쓴다**.
- 되돌리기: 변경마다 이전 Edit JSON 전체를 history 스택에 넣는다. Edit JSON 밖의 화면 정보(제목, 썸네일 등)는 별도 상태로 둔다.
- 서버 렌더링 처리 순서: 자르기 → 빠르기 → 소리 크기 → 잇기 (PLAN 10장)

---

## 4. 에러 형식

HTTP 에러 응답과 작업 `error` 필드는 **같은 모양**을 쓴다.

```json
{ "error": { "code": "INVALID_URL", "message": "유튜브 주소가 아니에요. 주소를 다시 확인해 주세요." } }
```

- 작업 안에서는 `"error": { "code": ..., "message": ... }` (바깥 `error` 키가 이미 있음).
- `message`는 **사용자에게 그대로 보여주는 쉬운 말**. 프론트는 `code`로 분기하고, 문구는 `message`를 그대로 쓴다.
- FastAPI 기본 422(`{"detail": [...]}`)를 그대로 내보내지 말고 이 형식으로 바꾼다.

| `code` | HTTP / 작업 | `message` (초안) |
|---|---|---|
| `INVALID_URL` | 400 | 유튜브 주소가 아니에요. 주소를 다시 확인해 주세요. |
| `PLAYLIST_NOT_ALLOWED` | 400 | 재생목록은 가져올 수 없어요. 노래 영상 하나의 주소를 넣어주세요. |
| `TOO_LONG` | 작업 | 20분이 넘는 영상은 가져올 수 없어요. |
| `VIDEO_UNAVAILABLE` | 작업 | 이 영상은 가져올 수 없어요. 다른 영상을 골라주세요. |
| `EXTRACT_FAILED` | 작업 | 노래를 가져오지 못했어요. 잠시 후 다시 시도해 주세요. |
| `EXPORT_FAILED` | 작업 | 노래를 만들지 못했어요. 잠시 후 다시 시도해 주세요. |
| `TIMEOUT` | 작업 | 시간이 너무 오래 걸려서 멈췄어요. 잠시 후 다시 시도해 주세요. |
| `INVALID_EDIT` | 422 | 편집 내용에 문제가 있어요. 다시 확인해 주세요. |
| `NOT_FOUND` | 404 | 노래를 찾을 수 없어요. 처음부터 다시 해주세요. |
| `NOT_READY` | 409 | 아직 준비 중이에요. 잠시만 기다려 주세요. |
| `RATE_LIMITED` | 429 | 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. |
| `INTERNAL` | 500 | 문제가 생겼어요. 잠시 후 다시 시도해 주세요. |

---

## 5. 변경 기록

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-10-11 | 처음 작성 |
| v1.1 | 2026-10-11 | 운영용 `GET /health` 표기 |
| v1.2 | 2026-10-11 | Edit JSON `tracks` 최대 20개 |
