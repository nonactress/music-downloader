import { beforeEach, describe, expect, it } from 'vitest'
import { SPEED_STEP, canFaster, canSlower, normalizeSpeed } from '../lib/speed'
import { resultDuration, selectLastChange, trimState, useEditStore } from './editStore'

const info = (id: string, durationSec: number) => ({
  trackId: id,
  title: id,
  channel: 'c',
  durationSec,
  thumbnailUrl: '',
})

const st = () => useEditStore.getState()

describe('editStore', () => {
  beforeEach(() => st().reset())

  it('노래를 추가하면 CONTRACT 3-3 기본값, 되돌리기 대상 아님', () => {
    st().addTrack(info('t1', 224.83))
    expect(st().edit).toEqual({
      tracks: [{ sourceId: 't1', start: 0, end: 224.83, speed: 1.0, keepPitch: true }],
      crossfade: 2,
      normalize: true,
      format: 'mp3',
    })
    expect(st().history).toHaveLength(0)
  })

  it('같은 노래를 두 번 넣지 않는다', () => {
    st().addTrack(info('t1', 100))
    st().addTrack(info('t1', 100))
    expect(st().edit.tracks).toHaveLength(1)
  })

  it('commit · undo — 알림은 남은 마지막 변경', () => {
    st().addTrack(info('t1', 100))
    const e0 = st().edit
    st().commit({ ...e0, normalize: false }, { prefix: 'A' })
    st().commit({ ...st().edit, crossfade: 0 }, { prefix: 'B' })
    expect(selectLastChange(st())?.prefix).toBe('B')
    st().undo()
    expect(st().edit.crossfade).toBe(2)
    expect(selectLastChange(st())?.prefix).toBe('A')
    st().undo()
    expect(st().edit).toEqual(e0)
    expect(selectLastChange(st())).toBeNull()
  })

  it('appendTrack — 맨 아래에 붙고 되돌리기 1번, 알림 "N번 노래를 붙였어요" (결정 36)', () => {
    st().addTrack(info('t1', 100))
    st().appendTrack(info('t2', 240))
    expect(st().edit.tracks.map((t) => t.sourceId)).toEqual(['t1', 't2'])
    expect(st().edit.tracks[1]).toEqual({ sourceId: 't2', start: 0, end: 240, speed: 1.0, keepPitch: true })
    expect(st().trackInfo.t2.durationSec).toBe(240)
    expect(selectLastChange(st())).toEqual({ prefix: '2번 노래를 붙였어요', trackIndex: 1 })
    st().appendTrack(info('t2', 240))
    expect(st().edit.tracks).toHaveLength(2)
    expect(st().history).toHaveLength(1)
    st().undo()
    expect(st().edit.tracks.map((t) => t.sourceId)).toEqual(['t1'])
  })

  it('setLive 여러 번 + recordSince = 되돌리기 1번 (결정 22)', () => {
    st().addTrack(info('t1', 100))
    const before = st().edit
    const t = before.tracks[0]
    st().setLive({ ...before, tracks: [{ ...t, start: 5 }] })
    st().setLive({ ...before, tracks: [{ ...t, start: 10, end: 90 }] })
    st().recordSince(before, { prefix: '잘랐어요', trackIndex: 0 })
    expect(st().history).toHaveLength(1)
    st().undo()
    expect(st().edit).toEqual(before)
  })
})

describe('빠르기 [+][−] 저장값 (화면 글자 말고 Edit JSON)', () => {
  beforeEach(() => st().reset())

  /** ⑤ 조금씩 바꾸기 버튼과 같은 동작: 비활성이 아니면 normalizeSpeed(x ± 0.05)를 setLive */
  const press = (dir: 1 | -1) => {
    const e = st().edit
    const t = e.tracks[0]
    if (dir > 0 ? !canFaster(t.speed) : !canSlower(t.speed)) return
    st().setLive({ ...e, tracks: [{ ...t, speed: normalizeSpeed(t.speed + dir * SPEED_STEP) }] })
  }

  it('1.0에서 [+] 20번 → speed toBe(2), [−] 30번 → toBe(0.5)', () => {
    st().addTrack(info('t1', 100))
    for (let i = 0; i < 20; i++) press(1)
    expect(st().edit.tracks[0].speed).toBe(2)
    for (let i = 0; i < 30; i++) press(-1)
    expect(st().edit.tracks[0].speed).toBe(0.5)
  })
})

describe('trimState', () => {
  const t = (start: number, end: number) => ({ sourceId: 'a', start, end, speed: 1, keepPitch: true })
  it('앞 · 뒤 · 앞뒤 · 없음', () => {
    expect(trimState(t(0, 100), 100)).toBe('none')
    expect(trimState(t(0, 99.97), 100)).toBe('none')
    expect(trimState(t(5, 100), 100)).toBe('front')
    expect(trimState(t(0, 95), 100)).toBe('back')
    expect(trimState(t(5, 95), 100)).toBe('both')
  })
})

describe('resultDuration', () => {
  it('Σ(end−start)/speed − crossfade×(곡 수−1)', () => {
    expect(
      resultDuration({
        tracks: [
          { sourceId: 'a', start: 12.5, end: 200, speed: 1, keepPitch: true },
          { sourceId: 'b', start: 0, end: 240, speed: 1.25, keepPitch: true },
        ],
        crossfade: 2,
        normalize: true,
        format: 'mp3',
      }),
    ).toBeCloseTo(187.5 + 192 - 2)
  })
})
