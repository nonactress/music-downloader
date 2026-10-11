// 빠르기 규칙 · 문구 (CONTRACT 3-2, PLAN 결정 26 · 27 · 35)
export const SPEED_MIN = 0.5
export const SPEED_MAX = 2.0
export const SPEED_STEP = 0.05

export interface SpeedPreset {
  name: string
  sub: string
  value: number
}

/** 와이어프레임 프리셋 3개 */
export const SPEED_PRESETS: SpeedPreset[] = [
  { name: '느리게', sub: '0.75배', value: 0.75 },
  { name: '보통', sub: '원래 빠르기', value: 1.0 },
  { name: '빠르게', sub: '1.25배', value: 1.25 },
]

/** 0.05 단위로 맞추고 범위 안으로 (부동소수 오차 제거) */
export function normalizeSpeed(x: number): number {
  const stepped = Math.round(x / SPEED_STEP) * SPEED_STEP
  return Number(Math.min(SPEED_MAX, Math.max(SPEED_MIN, stepped)).toFixed(2))
}

export const isSameSpeed = (a: number, b: number) => Math.abs(a - b) < 1e-9

export const canSlower = (x: number) => x > SPEED_MIN + 1e-9
export const canFaster = (x: number) => x < SPEED_MAX - 1e-9

/** 결정 35: 소수 첫째 자리까지 항상 — 1 → "1.0배", 1.1 → "1.1배", 1.25 → "1.25배", 2 → "2.0배" */
export const formatRate = (x: number) => `${x.toFixed(2).replace(/(\.\d)0$/, '$1')}배`

/** 결정 27: 1보다 작으면 "느리게", 1이면 "보통", 크면 "빠르게" */
export function speedName(x: number): string {
  if (isSameSpeed(x, 1)) return '보통'
  return x < 1 ? '느리게' : '빠르게'
}

/** 알림 · 경고에 쓰는 "빠르게(1.25배)" */
export const speedWithRate = (x: number) => `${speedName(x)}(${formatRate(x)})`
