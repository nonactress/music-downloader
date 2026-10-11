// 편집 상태를 화면 문구로 (와이어프레임 · PLAN 결정 18)
import type { TrimState } from '../store/editStore'

/** 카드 길이 뒤 괄호 — 안 자르면 빈 문자열 */
export function trimLabel(state: TrimState): string {
  switch (state) {
    case 'front': return ' (앞 잘라냄)'
    case 'back': return ' (뒤 잘라냄)'
    case 'both': return ' (앞뒤 잘라냄)'
    default: return ''
  }
}

const rate = (speed: number) => `${Number(speed.toFixed(2))}배`

/** 1.0 → "보통 빠르기", 1.25 → "빠르게 1.25배", 0.75 → "느리게 0.75배" */
export function speedLabel(speed: number): string {
  if (Math.abs(speed - 1) < 1e-9) return '보통 빠르기'
  return speed < 1 ? `느리게 ${rate(speed)}` : `빠르게 ${rate(speed)}`
}
