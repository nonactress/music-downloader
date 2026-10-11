import { describe, expect, it } from 'vitest'
import { moveTrim, trimLimits } from './trim'

const t = (start: number, end: number) => ({ sourceId: 'a', start, end, speed: 1, keepPitch: true })

describe('moveTrim', () => {
  it('5초씩, 끝에 닿으면 멈춤', () => {
    expect(moveTrim(t(12, 200), 224.83, 'startDown').start).toBe(7)
    expect(moveTrim(t(3, 200), 224.83, 'startDown').start).toBe(0)
    expect(moveTrim(t(0, 222), 224.83, 'endUp').end).toBe(224.83)
    expect(moveTrim(t(0, 200), 224.83, 'endDown').end).toBe(195)
  })
  it('최소 1초는 남긴다', () => {
    expect(moveTrim(t(10, 13), 100, 'startUp').start).toBe(12)
    expect(moveTrim(t(10, 13), 100, 'endDown').end).toBe(11)
  })
})

describe('trimLimits (결정 19)', () => {
  it('처음 상태: 시작 −, 끝 + 비활성', () => {
    expect(trimLimits(t(0, 224.83), 224.83)).toEqual({ startDown: false, startUp: true, endDown: true, endUp: false })
  })
  it('1초만 남으면 시작 + · 끝 − 비활성', () => {
    expect(trimLimits(t(10, 11), 100)).toEqual({ startDown: true, startUp: false, endDown: false, endUp: true })
  })
})
