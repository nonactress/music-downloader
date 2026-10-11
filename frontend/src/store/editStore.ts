// 편집 상태 = Edit JSON 하나 + 되돌리기 기록 (CONTRACT 3장)
import { create } from 'zustand'
import type { EditJson, EditTrack, TrackInfo } from '../api/types'

export const DEFAULT_CROSSFADE = 2
/** 원곡 길이 비교 오차 (CONTRACT 3-2와 같음) */
export const DURATION_EPSILON = 0.05

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

/** 한 곡의 결과 길이 (초) */
export const trackDuration = (t: EditTrack) => (t.end - t.start) / t.speed

/** CONTRACT 3-4 결과 길이 */
export function resultDuration(edit: EditJson): number {
  const sum = edit.tracks.reduce((acc, t) => acc + trackDuration(t), 0)
  const fades = edit.crossfade > 0 ? edit.crossfade * Math.max(0, edit.tracks.length - 1) : 0
  return Math.max(0, sum - fades)
}

export type TrimState = 'none' | 'front' | 'back' | 'both'

export function trimState(t: EditTrack, durationSec: number): TrimState {
  const front = t.start > 0
  const back = t.end < durationSec - DURATION_EPSILON
  return front && back ? 'both' : front ? 'front' : back ? 'back' : 'none'
}

/** 화면 알림에 쓰는 변경 설명. emphasis는 굵게 표시 */
export interface Change {
  prefix: string
  emphasis?: string
  suffix?: string
  /** "방금 바뀜"을 붙일 노래 (0부터) */
  trackIndex?: number
  /** 모든 노래에 "방금 바뀜" (모든 노래 빠르기, 결정 29) */
  allTracks?: boolean
}

interface HistoryEntry {
  /** 이 변경 전의 Edit JSON 전체 */
  edit: EditJson
  change: Change
}

interface EditStore {
  edit: EditJson
  history: HistoryEntry[]
  /** Edit JSON 밖의 화면 정보 (제목, 썸네일 …), sourceId로 찾는다 */
  trackInfo: Record<string, TrackInfo>

  /** 변경 하나 = 되돌리기 1번. 바꾸는 즉시 반영된다 */
  commit: (next: EditJson, change: Change) => void
  /** 기록 없이 바로 반영 — 잘라내기 화면 안에서 쓰고, 나갈 때 recordSince로 한 번에 기록 (결정 22) */
  setLive: (next: EditJson) => void
  /** before 이후 바뀐 것 전체를 되돌리기 1번으로 기록 */
  recordSince: (before: EditJson, change: Change) => void
  /** 불러온 노래를 목록에 넣는다 (되돌리기 대상 아님) */
  addTrack: (info: TrackInfo) => void
  undo: () => void
  reset: () => void
}

export const useEditStore = create<EditStore>((set) => ({
  edit: emptyEdit(),
  history: [],
  trackInfo: {},

  commit: (next, change) =>
    set((s) => ({ edit: next, history: [...s.history, { edit: s.edit, change }] })),

  setLive: (next) => set({ edit: next }),

  recordSince: (before, change) =>
    set((s) => ({ history: [...s.history, { edit: before, change }] })),

  addTrack: (info) =>
    set((s) => {
      if (s.edit.tracks.some((t) => t.sourceId === info.trackId)) return s
      return {
        edit: { ...s.edit, tracks: [...s.edit.tracks, defaultEditTrack(info)] },
        trackInfo: { ...s.trackInfo, [info.trackId]: info },
      }
    }),

  undo: () =>
    set((s) => {
      const last = s.history[s.history.length - 1]
      if (!last) return s
      return { edit: last.edit, history: s.history.slice(0, -1) }
    }),

  reset: () => set({ edit: emptyEdit(), history: [], trackInfo: {} }),
}))

/** 지금 되돌릴 수 있는 마지막 변경 (알림 · "방금 바뀜"에 표시) */
export const selectLastChange = (s: EditStore): Change | null =>
  s.history.length ? s.history[s.history.length - 1].change : null

/** 모든 노래를 불러온 직후 상태로 */
export function initialEdit(edit: EditJson, info: Record<string, TrackInfo>): EditJson {
  return {
    ...emptyEdit(),
    tracks: edit.tracks.map((t) => defaultEditTrack(info[t.sourceId])),
  }
}

export function isSameEdit(a: EditJson, b: EditJson): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
