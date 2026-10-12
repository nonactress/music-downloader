# 쉬운 음악 만들기 (music-downloader)

유튜브 링크로 노래를 불러와 **잘라내기 · 빠르기 · 이어 붙이기**를 하고 mp3로 저장하는 PC 웹 서비스.
디지털에 익숙하지 않은 사용자도 쓸 수 있는 **쉬운 UI/UX**가 목표입니다.

![편집 홈 와이어프레임](docs/wireframes/png/03-edit-home.png)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | 요구사항, 사용자 흐름, UX 원칙, 적용 범위 규칙, 아키텍처, API, 개발 순서, 리스크, 결정 기록 |
| [docs/CONTRACT.md](docs/CONTRACT.md) | API 6개 · Edit JSON · 에러 형식 계약 |
| [docs/HELP.md](docs/HELP.md) | 화면 [도움말] 문구 |
| [backend/README.md](backend/README.md) | 백엔드 구조, 로컬 실행, 환경 변수, 서버 1대 배포 점검 목록 |
| [docs/wireframes/png](docs/wireframes/png) | 화면 7개 와이어프레임 이미지 |
| [docs/wireframes/html](docs/wireframes/html) | 브라우저로 여는 와이어프레임 (`Main.html`부터, 화면 간 링크 연결) |
| [docs/wireframes/source](docs/wireframes/source) | 디자인 캔버스 원본 소스 (`.dc.html`) |

## Claude 팀으로 개발하기 (tmux)

에이전트 3개(Lead · Backend · Frontend)가 문서와 와이어프레임을 기준으로 나눠서 작업합니다.

```bash
brew install tmux          # 처음 한 번
./scripts/team.sh          # 레포 폴더에서 실행
tmux kill-session -t music-team   # 종료
```

| 파일 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 팀 공통 규칙 (UX 절대 규칙, 폴더 소유권, 작업 방식) |
| [team/prompts/](team/prompts) | 역할별 시작 프롬프트 (lead, backend, frontend) |
| [scripts/team.sh](scripts/team.sh) | tmux 4분할 실행 스크립트 (worktree 생성, 공유 보드 `.team/board.md`) |

## 진행 상황

PLAN.md 13장 개발 순서 1~6단계 완료 (2026-10-12, 6단계 = 접속 제한 로그인). `docker compose up` 실기 확인 끝. **배포는 윈도우 프로그램으로 결정**([이슈 #1](https://github.com/nonactress/music-downloader/issues/1), PLAN 결정 64~76) → 7단계 진행 중. 설치 파일이 나오면 설치 안내는 `docs/HELP.md` 마지막 장.

## 실행

Docker로 (사용자는 http://localhost:8080 하나로 접속):

```bash
docker compose up --build      # web(nginx) · api · worker · redis — 2026-10-12 실기 확인 (colima)
docker compose exec api python -m app.accounts add <아이디>   # 처음 한 번: 로그인 계정 만들기
```

Docker 없이 개발할 때: 백엔드는 [backend/README.md](backend/README.md) "로컬 실행", 프론트는

```bash
cd frontend && npm install
npm run dev          # http://localhost:5173 (/api → :8000)
npm run dev:mock     # 백엔드 없이 가짜 데이터로
npm test && npm run e2e
```

## 기술 스택

React + TypeScript (Vite) · Zustand · wavesurfer.js / FastAPI · Celery + Redis · yt-dlp · ffmpeg / nginx · Docker Compose
