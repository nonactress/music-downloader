// 새로고침 · 창을 실수로 닫아도 이어서 (결정 48)
// 편집 내용 · 되돌리기 기록 · 노래 정보 · 진행 중인 작업을 브라우저에 저장하고, 다시 열면 이어 간다
import type { EditJson, TrackInfo } from '../api/types'
import { useEditStore, type Change } from './editStore'
import { useFlowStore, type Screen } from './flowStore'

export const SESSION_KEY = 'easy-music:session'
/** 서버 보관 24시간보다 1시간 짧게 — 다시 열었는데 노래가 지워져 있지 않게 */
export const RESTORE_LIMIT_MS = 23 * 60 * 60 * 1000

interface Saved {
  v: 1
  startedAt: number
  edit: EditJson
  history: { edit: EditJson; change: Change }[]
  trackInfo: Record<string, TrackInfo>
  /** 불러오는 중 · 만드는 중이면 그 작업 */
  job: { kind: 'extract'; id: string; mode: 'import' | 'append' } | { kind: 'export'; id: string } | null
  lastUrl: string
  appendUrl: string
}

/** 잘라내기 · 한 곡 빠르기 화면은 나갈 때 기록하므로(결정 22 · 28), 들어가기 전 상태를 저장한다 */
const LIVE_SCREENS: Screen[] = ['trim', 'speed']

let beforeLive: { edit: EditJson; history: Saved['history'] } | null = null

function snapshot(): Saved | null {
  const flow = useFlowStore.getState()
  const store = useEditStore.getState()
  if (flow.startedAt === null) return null
  const job: Saved['job'] =
    flow.screen === 'loading' && flow.extractJobId
      ? { kind: 'extract', id: flow.extractJobId, mode: flow.extractMode }
      : flow.screen === 'saving' && flow.exportJobId
        ? { kind: 'export', id: flow.exportJobId }
        : null
  if (store.edit.tracks.length === 0 && !job) return null
  const base = LIVE_SCREENS.includes(flow.screen) && beforeLive ? beforeLive : store
  return {
    v: 1,
    startedAt: flow.startedAt,
    edit: base.edit,
    history: base.history,
    trackInfo: store.trackInfo,
    job,
    lastUrl: flow.lastUrl,
    appendUrl: flow.appendUrl,
  }
}

function save() {
  try {
    const data = snapshot()
    if (data) localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // 저장이 막혀 있거나 가득 차도 편집은 계속된다
  }
}

/** ⑦ [새 노래 만들기] — 저장해 둔 것을 지운다 */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // 무시
  }
}

function read(now: number): Saved | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Saved
    if (data.v !== 1 || typeof data.startedAt !== 'number' || !Array.isArray(data.edit?.tracks)) return null
    if (now - data.startedAt >= RESTORE_LIMIT_MS || now < data.startedAt) return null
    return data
  } catch {
    return null
  }
}

/** 앱을 열 때 한 번: 저장해 둔 것이 있으면 이어 가고, 그 뒤로 바뀔 때마다 저장 */
export function initSession(now = Date.now()) {
  const data = read(now)
  if (data) {
    useEditStore.setState({ edit: data.edit, history: data.history, trackInfo: data.trackInfo })
    const common = { startedAt: data.startedAt, lastUrl: data.lastUrl, appendUrl: data.appendUrl, exportResult: null }
    if (data.job?.kind === 'extract') {
      useFlowStore.setState({ ...common, screen: 'loading', extractJobId: data.job.id, extractMode: data.job.mode })
    } else if (data.job?.kind === 'export') {
      useFlowStore.setState({ ...common, screen: 'saving', exportJobId: data.job.id })
    } else {
      useFlowStore.setState({ ...common, screen: 'edit', extractJobId: null, exportJobId: null })
    }
  } else {
    clearSession()
  }

  let lastScreen = useFlowStore.getState().screen
  useFlowStore.subscribe((s) => {
    if (LIVE_SCREENS.includes(s.screen) && s.screen !== lastScreen) {
      const { edit, history } = useEditStore.getState()
      beforeLive = { edit, history }
    }
    lastScreen = s.screen
    save()
  })
  useEditStore.subscribe(save)
}
