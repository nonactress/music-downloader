#!/usr/bin/env bash
# 쉬운 음악 만들기 — Claude 3인 팀을 tmux로 실행
# 사용법: ./scripts/team.sh [레포 경로]   (기본: 현재 폴더)
# 종료:   tmux kill-session -t music-team
set -euo pipefail

REPO="$(cd "${1:-.}" && pwd)"
SESSION="music-team"
TEAM_DIR="$REPO/.team"                       # 공유 보드 · 프롬프트 (git 무시)
WT_BACKEND="$(dirname "$REPO")/music-downloader-backend"
WT_FRONTEND="$(dirname "$REPO")/music-downloader-frontend"
CLAUDE_OPTS="--permission-mode acceptEdits"  # 파일 수정은 자동 허용, 명령 실행은 확인

command -v tmux   >/dev/null || { echo "tmux가 없어요: brew install tmux"; exit 1; }
command -v claude >/dev/null || { echo "claude CLI가 없어요"; exit 1; }
[ -f "$REPO/docs/PLAN.md" ] || { echo "$REPO 에 docs/PLAN.md가 없어요"; exit 1; }
tmux has-session -t "$SESSION" 2>/dev/null && { echo "이미 실행 중: tmux attach -t $SESSION"; exit 0; }

# 1) 공유 보드
mkdir -p "$TEAM_DIR/prompts"
grep -qxF ".team/" "$REPO/.gitignore" 2>/dev/null || echo ".team/" >> "$REPO/.gitignore"
[ -f "$TEAM_DIR/board.md" ] || printf "# 팀 보드\n\n## 작업 목록\n\n## 리뷰 요청 / 질문\n\n" > "$TEAM_DIR/board.md"

# 2) 팀원별 작업 폴더 (git worktree, 브랜치 분리 → 충돌 방지)
cd "$REPO"
git rev-parse --verify main >/dev/null 2>&1 || { echo "main 브랜치에 커밋이 하나 이상 있어야 해요"; exit 1; }
[ -d "$WT_BACKEND" ]  || git worktree add -B feat/backend  "$WT_BACKEND"  main
[ -d "$WT_FRONTEND" ] || git worktree add -B feat/frontend "$WT_FRONTEND" main

# 3) 역할 프롬프트에 경로 채우기
for role in lead backend frontend; do
  sed -e "s#{{REPO}}#$REPO#g" -e "s#{{TEAM_DIR}}#$TEAM_DIR#g" \
      -e "s#{{WT_BACKEND}}#$WT_BACKEND#g" -e "s#{{WT_FRONTEND}}#$WT_FRONTEND#g" \
      "$REPO/team/prompts/$role.md" > "$TEAM_DIR/prompts/$role.md"
done

# 4) tmux 레이아웃:  왼쪽 위 lead | 오른쪽 위 backend
#                    왼쪽 아래 frontend | 오른쪽 아래 보드(실시간)
tmux new-session  -d -s "$SESSION" -n team -c "$REPO"
tmux split-window -h -t "$SESSION:team.0" -c "$WT_BACKEND"
tmux split-window -v -t "$SESSION:team.0" -c "$WT_FRONTEND"
tmux split-window -v -t "$SESSION:team.2" -c "$TEAM_DIR"
tmux set -t "$SESSION" pane-border-status top

start() { # pane, 제목, 역할
  tmux select-pane -t "$SESSION:team.$1" -T "$2"
  tmux send-keys   -t "$SESSION:team.$1" "claude $CLAUDE_OPTS \"\$(cat '$TEAM_DIR/prompts/$3.md')\"" C-m
}
start 0 "LEAD"     lead
start 1 "FRONTEND" frontend
start 2 "BACKEND"  backend
tmux select-pane -t "$SESSION:team.3" -T "BOARD"
tmux send-keys   -t "$SESSION:team.3" "while true; do clear; tail -n 40 board.md; sleep 3; done" C-m

tmux select-pane -t "$SESSION:team.0"
tmux attach -t "$SESSION"
