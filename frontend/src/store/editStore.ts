// 편집 상태 = Edit JSON 하나 + 되돌리기 기록 (CONTRACT 3장)
import { create } from 'zustand'
import type { EditJson, EditTrack, TrackInfo } from '../api/types'

export const DEFAULT_CROSSFADE = 2

export const emptyEdit = (): EditJson => ({
  tracks: [],
  crossfade: DEFAULT_CROSSFADE,
  normalize: true,
  format: 'mp3',
})

/** CONTRACT 3-3 기본값 */
export const defaultEditTrack = (info: TrackInfo): EditTrack => ({
  sourceId: info.trackId,
  start: 0,
  end: info.durationSec,
  speed: 1.0,
  keepPitch: true,
})

/** CONTRACT 3-4 결과 길이 */
export function resultDuration(edit: EditJson): number {
  const sum = edit.tracks.reduce((acc, t) => acc + (t.end - t.start) / t.speed, 0)
  const fades = edit.crossfade > 0 ? edit.crossfade * Math.max(0, edit.tracks.length - 1) : 0
  return Math.max(0, sum - fades)
}

interface EditStore {
  edit: EditJson
  /** 변경 전 Edit JSON 전체를 쌓는다 */
  history: EditJson[]
  /** Edit JSON 밖의 화면 정보 (제목, 썸네일 …), sourceId로 찾는다 */
  trackInfo: Record<string, TrackInfo>

  /** 변경 하나 = 기록 하나. 바꾸는 즉시 반영된다 */
  apply: (change: (edit: EditJson) => EditJson) => void
  addTrack: (info: TrackInfo) => void
  undo: () => void
  reset: () => void
}

export const useEditStore = create<EditStore>((set) => ({
  edit: emptyEdit(),
  history: [],
  trackInfo: {},

  apply: (change) =>
    set((s) => ({ edit: change(s.edit), history: [...s.history, s.edit] })),

  addTrack: (info) =>
    set((s) => ({
      edit: { ...s.edit, tracks: [...s.edit.tracks, defaultEditTrack(info)] },
      history: [...s.history, s.edit],
      trackInfo: { ...s.trackInfo, [info.trackId]: info },
    })),

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return s
      return { edit: s.history[s.history.length - 1], history: s.history.slice(0, -1) }
    }),

  reset: () => set({ edit: emptyEdit(), history: [], trackInfo: {} }),
}))
