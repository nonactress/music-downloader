# CLAUDE.md — 쉬운 음악 만들기 (팀 공통 규칙)

## 진실의 원천 (작업 전에 반드시 읽기)

| 우선순위 | 파일 | 용도 |
|---|---|---|
| 1 | `docs/PLAN.md` | 기능, 규칙, 아키텍처, API, 개발 순서 |
| 2 | `docs/wireframes/html/*.html` | 화면 구조 · 문구 · 크기의 기준 (브라우저로 열어 확인) |
| 3 | `docs/wireframes/png/*.png` | 완성 화면 비교용 이미지 |
| 4 | `docs/CONTRACT.md` | API · Edit JSON 계약 (리드가 작성, 리드만 수정) |

문서와 와이어프레임이 다르면 **임의로 정하지 말고** 공유 보드에 질문을 남긴다.

## 절대 규칙 (UX)

- 화면 문구는 와이어프레임 그대로 사용 (쉬운 말: 잘라내기 · 빠르기 · 이어 붙이기)
- 본문 글자 20px 이상, 버튼 높이 60px 이상, 아이콘만 있는 버튼 금지
- 드래그 대신 버튼 조작 제공 ([−5초] [+5초], [위로] [아래로])
- [적용하기] 버튼 없음 → 즉시 반영 + "바뀌었어요 [되돌리기]" (예외: 모든 노래 빠르기)
- 잘라내기는 항상 한 곡씩. 전체 자르기 기능은 만들지 않음
- 모든 노래 빠르기는 곡별 값을 덮어씀 → 화면에서 미리 경고
- 편집 중 서버 렌더링 금지. 미리듣기는 브라우저, 렌더링은 내보낼 때 1회

## 기술 스택

React + TypeScript (Vite) + Zustand + wavesurfer.js / FastAPI / Celery + Redis / yt-dlp / ffmpeg / Docker Compose

## 폴더 소유권 (남의 폴더는 수정 금지)

| 폴더 | 담당 |
|---|---|
| `docs/`, `team/`, `scripts/`, `docker-compose.yml`, `CLAUDE.md` | lead |
| `backend/`, `worker/`, `desktop/`, `.github/workflows/desktop.yml` | backend |
| `frontend/` | frontend |

## 작업 방식

- 작업 단위는 `docs/PLAN.md` 13장 개발 순서를 따른다 (1단계부터)
- 한 작업 = 한 커밋. 커밋 메시지 한국어, `feat:` `fix:` `docs:` `test:` 접두사
- 끝나면 테스트를 돌리고, 공유 보드에 "리뷰 요청: <브랜치> <요약>"을 남긴다
- subprocess는 인자 리스트로만 실행 (`shell=True` 금지)
