// 잘라내기 버튼 규칙 (CONTRACT 3-2, PLAN 결정 19): 0 ≤ start, end ≤ 원곡 길이, end − start ≥ 1
import type { EditTrack } from '../api/types'

export const TRIM_STEP = 5
export const MIN_KEEP = 1

export interface TrimLimits {
  startDown: boolean
  startUp: boolean
  endDown: boolean
  endUp: boolean
}

export function trimLimits(t: EditTrack, durationSec: number): TrimLimits {
  return {
    startDown: t.start > 0,
    startUp: t.start < t.end - MIN_KEEP,
    endDown: t.end > t.start + MIN_KEEP,
    endUp: t.end < durationSec,
  }
}

type Move = 'startDown' | 'startUp' | 'endDown' | 'endUp'

/** 5초씩 움직이되 끝에 닿으면 거기서 멈춘다 */
export function moveTrim(t: EditTrack, durationSec: number, move: Move): EditTrack {
  switch (move) {
    case 'startDown': return { ...t, start: Math.max(0, t.start - TRIM_STEP) }
    case 'startUp': return { ...t, start: Math.min(t.end - MIN_KEEP, t.start + TRIM_STEP) }
    case 'endDown': return { ...t, end: Math.max(t.start + MIN_KEEP, t.end - TRIM_STEP) }
    case 'endUp': return { ...t, end: Math.min(durationSec, t.end + TRIM_STEP) }
  }
}

/** 손잡이 끌기 · 키보드 (결정 63): 0.1초 단위로 저장 */
export const DRAG_STEP = 0.1
export const KEY_STEP = 1
export const KEY_STEP_BIG = 5

export type Edge = 'start' | 'end'

const roundStep = (sec: number) => Math.round(sec / DRAG_STEP) * DRAG_STEP

/** 손잡이를 sec 위치로 — 0.1초로 맞추고 범위 · 최소 1초(결정 19) 안으로 */
export function placeEdge(t: EditTrack, durationSec: number, edge: Edge, sec: number): EditTrack {
  // 원곡 길이는 0.1초로 안 떨어질 수 있다(224.83초) — 맨 끝까지 끌면 원곡 끝 그대로
  const v = sec >= durationSec - DRAG_STEP / 2 ? durationSec : Number(roundStep(sec).toFixed(1))
  if (edge === 'start') return { ...t, start: Math.max(0, Math.min(t.end - MIN_KEEP, v)) }
  return { ...t, end: Math.min(durationSec, Math.max(t.start + MIN_KEEP, v)) }
}

/** 키보드 ←/→: 지금 값에서 delta초 */
export function nudgeEdge(t: EditTrack, durationSec: number, edge: Edge, delta: number): EditTrack {
  return placeEdge(t, durationSec, edge, (edge === 'start' ? t.start : t.end) + delta)
}
