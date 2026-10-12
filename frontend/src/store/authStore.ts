// 접속 제한 로그인 (결정 54~60) — 로그인했는지 · 누구인지
import { create } from 'zustand'
import { api } from '../api/client'

/** checking: 앱을 열고 GET /auth/me 답을 기다리는 중 */
export type AuthStatus = 'checking' | 'out' | 'in'

interface AuthStore {
  status: AuthStatus
  loginId: string | null
  /** POST /auth/login — 실패하면 ApiError를 그대로 던진다 (화면이 message를 보여줌) */
  login: (loginId: string, password: string) => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'checking',
  loginId: null,
  login: async (loginId, password) => {
    const { user } = await api.login(loginId, password)
    set({ status: 'in', loginId: user.loginId })
  },
}))

/** 앱을 열 때 한 번: 로그인 화면을 보일지, 원래 화면을 보일지 (CONTRACT 5-4) */
export async function initAuth() {
  try {
    const { user } = await api.me()
    useAuthStore.setState({ status: 'in', loginId: user.loginId })
  } catch {
    // 401이든 서버가 꺼져 있든 로그인 화면 — 로그인할 때 안내가 나온다
    useAuthStore.setState({ status: 'out', loginId: null })
  }
}
