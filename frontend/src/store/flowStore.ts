// 어떤 화면을 보여줄지 + 화면 사이에 넘기는 작업 정보
import { create } from 'zustand'
import type { ExportResult } from '../api/types'

export type Screen = 'import' | 'loading' | 'done'

interface FlowStore {
  screen: Screen
  /** 진행 중인 추출 작업 (② 불러오는 중) */
  extractJobId: string | null
  /** ① 입력칸에 넣었던 주소 — 다시 시도할 때 채워 둔다 */
  lastUrl: string
  exportResult: ExportResult | null

  startLoading: (extractJobId: string, url: string) => void
  finish: (result: ExportResult) => void
  goImport: () => void
}

export const useFlowStore = create<FlowStore>((set) => ({
  screen: 'import',
  extractJobId: null,
  lastUrl: '',
  exportResult: null,

  startLoading: (extractJobId, url) =>
    set({ screen: 'loading', extractJobId, lastUrl: url, exportResult: null }),
  finish: (result) => set({ screen: 'done', exportResult: result, extractJobId: null }),
  goImport: () => set({ screen: 'import', extractJobId: null }),
}))
