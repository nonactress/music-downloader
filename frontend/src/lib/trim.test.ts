import { describe, expect, it } from 'vitest'
import { moveTrim, nudgeEdge, placeEdge, trimLimits } from './trim'

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

describe('placeEdge · nudgeEdge (결정 63)', () => {
  const t = { sourceId: 't1', start: 0, end: 224.83, speed: 1, keepPitch: true }

  it('0.1초 단위로 맞춘다', () => {
    expect(placeEdge(t, 224.83, 'start', 12.34).start).toBe(12.3)
    expect(placeEdge(t, 224.83, 'end', 100.06).end).toBe(100.1)
  })

  it('범위 밖은 0 · 원곡 길이, 맨 끝까지 끌면 원곡 끝 그대로', () => {
    expect(placeEdge(t, 224.83, 'start', -5).start).toBe(0)
    expect(placeEdge(t, 224.83, 'end', 300).end).toBe(224.83)
    expect(placeEdge(t, 224.83, 'end', 224.8).end).toBe(224.83)
  })

  it('최소 1초는 남긴다 (결정 19)', () => {
    const s = { ...t, start: 10, end: 20 }
    expect(placeEdge(s, 224.83, 'start', 25).start).toBe(19)
    expect(placeEdge(s, 224.83, 'end', 5).end).toBe(11)
  })

  it('키보드: 지금 값에서 ±초', () => {
    expect(nudgeEdge({ ...t, start: 10 }, 224.83, 'start', 1).start).toBe(11)
    expect(nudgeEdge(t, 224.83, 'end', -5).end).toBe(219.8)
    expect(nudgeEdge(t, 224.83, 'start', -1).start).toBe(0)
  })
})
