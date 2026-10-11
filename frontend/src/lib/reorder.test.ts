import { describe, expect, it } from 'vitest'
import { moveTrack, removeTrack } from './reorder'

const edit = (...ids: string[]) => ({
  tracks: ids.map((sourceId) => ({ sourceId, start: 0, end: 10, speed: 1, keepPitch: true })),
  crossfade: 2,
  normalize: true,
  format: 'mp3' as const,
})
const ids = (e: ReturnType<typeof edit>) => e.tracks.map((t) => t.sourceId)

describe('reorder', () => {
  it('위로 · 아래로, 끝을 넘으면 그대로', () => {
    expect(ids(moveTrack(edit('a', 'b', 'c'), 1, 0))).toEqual(['b', 'a', 'c'])
    expect(ids(moveTrack(edit('a', 'b', 'c'), 1, 2))).toEqual(['a', 'c', 'b'])
    expect(ids(moveTrack(edit('a', 'b'), 0, -1))).toEqual(['a', 'b'])
  })
  it('빼기, 1곡이면 그대로', () => {
    expect(ids(removeTrack(edit('a', 'b', 'c'), 1))).toEqual(['a', 'c'])
    expect(ids(removeTrack(edit('a'), 0))).toEqual(['a'])
  })
})
