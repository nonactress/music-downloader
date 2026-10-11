import { describe, expect, it } from 'vitest'
import { canFaster, canSlower, formatRate, normalizeSpeed, speedName, speedWithRate } from './speed'

describe('speed (결정 26 · 27)', () => {
  it('0.05 단위 · 0.5~2.0 범위 · 부동소수 오차 없음', () => {
    expect(normalizeSpeed(1.25 + 0.05)).toBe(1.3)
    expect(normalizeSpeed(1 - 0.05 - 0.05)).toBe(0.9)
    expect(normalizeSpeed(0.45)).toBe(0.5)
    expect(normalizeSpeed(2.05)).toBe(2)
    let x = 1
    for (let i = 0; i < 3; i++) x = normalizeSpeed(x + 0.05)
    expect(x).toBe(1.15)
  })
  it('끝에 닿으면 그쪽 비활성', () => {
    expect(canSlower(0.5)).toBe(false)
    expect(canSlower(0.55)).toBe(true)
    expect(canFaster(2)).toBe(false)
    expect(canFaster(1.95)).toBe(true)
  })
  it('표시 · 이름', () => {
    expect(formatRate(1.25)).toBe('1.25배')
    expect(formatRate(1.1)).toBe('1.1배')
    expect(formatRate(1)).toBe('1배')
    expect(speedName(0.75)).toBe('느리게')
    expect(speedName(1)).toBe('보통')
    expect(speedWithRate(1.25)).toBe('빠르게(1.25배)')
    expect(speedWithRate(1)).toBe('보통(1배)')
  })
})
