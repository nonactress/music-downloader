import { beforeEach, describe, expect, it } from 'vitest'
import { resultDuration, useEditStore } from './editStore'

const info = (id: string, durationSec: number) => ({
  trackId: id,
  title: id,
  channel: 'c',
  durationSec,
  thumbnailUrl: '',
})

describe('editStore', () => {
  beforeEach(() => useEditStore.getState().reset())

  it('노래를 추가하면 CONTRACT 3-3 기본값', () => {
    useEditStore.getState().addTrack(info('t1', 224.83))
    expect(useEditStore.getState().edit).toEqual({
      tracks: [{ sourceId: 't1', start: 0, end: 224.83, speed: 1.0, keepPitch: true }],
      crossfade: 2,
      normalize: true,
      format: 'mp3',
    })
  })

  it('되돌리기는 바로 전 Edit JSON으로', () => {
    const s = useEditStore.getState()
    s.addTrack(info('t1', 100))
    s.apply((e) => ({ ...e, normalize: false }))
    expect(useEditStore.getState().edit.normalize).toBe(false)
    useEditStore.getState().undo()
    expect(useEditStore.getState().edit.normalize).toBe(true)
    useEditStore.getState().undo()
    expect(useEditStore.getState().edit.tracks).toHaveLength(0)
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
