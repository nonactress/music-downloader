// 접속 제한 로그인 (결정 54~60) — 로그인했는지 · 누구인지
import { create } from 'zustand'
import { api, setUnauthorizedHandler } from '../api/client'
import { ApiError } from '../api/errors'
import { beginUser, endUser } from './persist'

/** checking: 앱을 열고 GET /auth/me 답을 기다리는 중 */
export type AuthStatus = 'checking' | 'out' | 'in'

/** CONTRACT 4장 UNAUTHORIZED — 쓰는 중 세션이 끝나 로그인 화면으로 왔을 때 */
export const SESSION_ENDED = '로그인이 필요해요. 다시 로그인해 주세요.'

interface AuthStore {
  status: AuthStatus
  loginId: string | null
  /** 로그인 화면에 처음부터 보일 안내 (세션이 끝나서 왔을 때) */
  notice: string | null
  /** POST /auth/login — 실패하면 ApiError를 그대로 던진다 (화면이 message를 보여줌) */
  login: (loginId: string, password: string) => Promise<void>
  /** [나가기] — 서버 세션 + 이 브라우저에 저장한 편집 내용을 지우고 로그인 화면 (결정 59) */
  logout: () => Promise<void>
  /** 쓰는 중 401 — 편집 내용은 남겨 두고 로그인 화면 (결정 60) */
  expire: () => void
}

function signedIn(loginId: string) {
  beginUser(loginId)
  useAuthStore.setState({ status: 'in', loginId, notice: null })
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'checking',
  loginId: null,
  notice: null,
  login: async (loginId, password) => {
    const { user } = await api.login(loginId, password)
    signedIn(user.loginId)
  },
  logout: async () => {
    try {
      await api.logout()
    } catch {
      // 서버에 닿지 않아도 이 브라우저에서는 나간다
    }
    endUser()
    set({ status: 'out', loginId: null, notice: null })
  },
  expire: () => {
    if (get().status !== 'in') return
    set({ status: 'out', loginId: null, notice: SESSION_ENDED })
  },
}))

setUnauthorizedHandler(() => useAuthStore.getState().expire())

/** <audio> · 다운로드 링크는 401을 화면이 알 수 없어서, 막혔을 때 · 누르기 직전에 GET /auth/me로 확인한다.
 *  세션이 끝났으면 expire()(결정 60)하고 false. 서버에 닿지 않는 등 다른 이유면 true (그대로 진행) */
export async function checkSession(): Promise<boolean> {
  if (useAuthStore.getState().status !== 'in') return false
  try {
    await api.me()
    return true
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      useAuthStore.getState().expire()
      return false
    }
    return true
  }
}

/** 앱을 열 때 한 번: 로그인 화면을 보일지, 원래 화면을 보일지 (CONTRACT 5-4) */
export async function initAuth() {
  try {
    const { user } = await api.me()
    signedIn(user.loginId)
  } catch {
    // 401이든 서버가 꺼져 있든 로그인 화면 — 로그인할 때 안내가 나온다
    useAuthStore.setState({ status: 'out', loginId: null })
  }
}
