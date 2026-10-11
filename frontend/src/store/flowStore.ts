// 어떤 화면을 보여줄지 + 화면 사이에 넘기는 작업 정보
import { create } from 'zustand'
import type { ExportResult } from '../api/types'

export type Screen = 'import' | 'loading' | 'edit' | 'trim' | 'speed' | 'speedAll' | 'saving' | 'done'

interface FlowStore {
  screen: Screen
  /** 진행 중인 추출 작업 (② 불러오는 중) */
  extractJobId: string | null
  /** 진행 중인 내보내기 작업 (저장 대기, 결정 16) */
  exportJobId: string | null
  /** 잘라내기 · 한 곡 빠르기 화면에서 고치는 노래 (0부터) */
  songIndex: number
  /** 모든 노래 빠르기에 한 곡 빠르기의 [모든 노래]로 왔으면 그 노래, 편집 홈에서 왔으면 null (결정 31) */
  speedAllFrom: number | null
  /** ① 입력칸에 넣었던 주소 — 다시 시도할 때 채워 둔다 */
  lastUrl: string
  exportResult: ExportResult | null

  startLoading: (extractJobId: string, url: string) => void
  startSaving: (exportJobId: string) => void
  openTrim: (index: number) => void
  openSpeed: (index: number) => void
  openSpeedAll: (from: number | null) => void
  goEdit: () => void
  finish: (result: ExportResult) => void
  goImport: () => void
}

export const useFlowStore = create<FlowStore>((set) => ({
  screen: 'import',
  extractJobId: null,
  exportJobId: null,
  songIndex: 0,
  speedAllFrom: null,
  lastUrl: '',
  exportResult: null,

  startLoading: (extractJobId, url) =>
    set({ screen: 'loading', extractJobId, lastUrl: url, exportResult: null }),
  startSaving: (exportJobId) => set({ screen: 'saving', exportJobId, exportResult: null }),
  openTrim: (index) => set({ screen: 'trim', songIndex: index }),
  openSpeed: (index) => set({ screen: 'speed', songIndex: index }),
  openSpeedAll: (from) => set({ screen: 'speedAll', speedAllFrom: from }),
  goEdit: () => set({ screen: 'edit', extractJobId: null, exportJobId: null }),
  finish: (result) => set({ screen: 'done', exportResult: result, exportJobId: null }),
  goImport: () => set({ screen: 'import', extractJobId: null, exportJobId: null }),
}))
