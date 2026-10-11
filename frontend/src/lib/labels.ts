// 편집 상태를 화면 문구로 (와이어프레임 · PLAN 결정 18)
import type { TrimState } from '../store/editStore'
import { formatRate, isSameSpeed } from './speed'

/** 카드 길이 뒤 괄호 — 안 자르면 빈 문자열 */
export function trimLabel(state: TrimState): string {
  switch (state) {
    case 'front': return ' (앞 잘라냄)'
    case 'back': return ' (뒤 잘라냄)'
    case 'both': return ' (앞뒤 잘라냄)'
    default: return ''
  }
}

/** 1.0 → "보통 빠르기", 1.25 → "빠르게 1.25배", 0.75 → "느리게 0.75배" */
export function speedLabel(speed: number): string {
  if (isSameSpeed(speed, 1)) return '보통 빠르기'
  return speed < 1 ? `느리게 ${formatRate(speed)}` : `빠르게 ${formatRate(speed)}`
}
