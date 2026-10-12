// 새로고침 · 창을 실수로 닫아도 이어서 (결정 48)
// 편집 내용 · 되돌리기 기록 · 노래 정보 · 진행 중인 작업을 브라우저에 저장하고, 다시 열면 이어 간다
// 저장할 때 누구 것인지(loginId)도 적어 두고, 다른 아이디로 로그인하면 지운다 (결정 60)
import type { EditJson, TrackInfo } from '../api/types'
import { useEditStore, type Change } from './editStore'
import { useFlowStore, type Screen } from './flowStore'

export const SESSION_KEY = 'easy-music:session'
/** 서버 보관 24시간보다 1시간 짧게 — 다시 열었는데 노래가 지워져 있지 않게 */
export const RESTORE_LIMIT_MS = 23 * 60 * 60 * 1000

interface Saved {
  /** 2: loginId 추가 (6단계). 1은 누구 것인지 몰라 버린다 */
  v: 2
  loginId: string
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
/** 지금 편집 내용의 주인 — 로그인하기 전(확인 중 · 나간 뒤)엔 null이고 저장하지 않는다 */
let owner: string | null = null

function snapshot(loginId: string): Saved | null {
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
    v: 2,
    loginId,
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
  if (owner === null) return
  try {
    const data = snapshot(owner)
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
    if (data.v !== 2 || typeof data.loginId !== 'string' || typeof data.startedAt !== 'number' || !Array.isArray(data.edit?.tracks)) return null
    if (now - data.startedAt >= RESTORE_LIMIT_MS || now < data.startedAt) return null
    return data
  } catch {
    return null
  }
}

/** 편집 내용 · 화면을 처음 상태로 + 저장해 둔 것 지우기 */
function resetAll() {
  beforeLive = null
  useEditStore.getState().reset()
  useFlowStore.setState(useFlowStore.getInitialState())
  clearSession()
}

/** 로그인 확인 · 로그인이 끝나면: 같은 아이디면 이어서, 다른 아이디면 앞 사람 것을 지운다 (결정 60) */
export function beginUser(loginId: string) {
  if (owner !== loginId) resetAll()
  owner = loginId
}

/** [나가기] — 이 브라우저에 저장한 편집 내용을 지운다 (결정 59) */
export function endUser() {
  owner = null
  resetAll()
}

/** 앱을 열 때 한 번: 저장해 둔 것이 있으면 이어 가고, 그 뒤로 바뀔 때마다 저장.
 *  누구 것인지는 로그인 확인(beginUser) 뒤에 따진다 */
export function initSession(now = Date.now()) {
  const data = read(now)
  if (data) {
    owner = data.loginId
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
