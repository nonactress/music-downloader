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
