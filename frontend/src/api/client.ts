import type {
  AuthResponse,
  CreateExportResponse,
  CreateTrackResponse,
  EditJson,
  Job,
  MeResponse,
  Peaks,
} from './types'
import { ApiError, FALLBACK_ERROR } from './errors'
import { mockApi } from './mock'

const BASE = '/api'

/** 쓰는 중 세션이 끝나 401이 오면 (결정 60). 로그인 · 로그인 확인 · 나가기 요청의 401은 제외 */
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}
const AUTH_PATHS = ['/auth/login', '/auth/me', '/auth/logout']

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(FALLBACK_ERROR, 0)
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !AUTH_PATHS.includes(path)) onUnauthorized()
    throw new ApiError(body?.error ?? FALLBACK_ERROR, res.status)
  }
  return body as T
}

export interface Api {
  /** CONTRACT 5장 — 쿠키 em_session은 브라우저가 알아서 주고받는다 */
  login(loginId: string, password: string): Promise<AuthResponse>
  logout(): Promise<void>
  me(): Promise<MeResponse>
  createTrack(url: string): Promise<CreateTrackResponse>
  getJob(jobId: string): Promise<Job>
  createExport(edit: EditJson): Promise<CreateExportResponse>
  downloadUrl(exportId: string): string
  audioUrl(trackId: string): string
  getPeaks(trackId: string): Promise<Peaks>
}

const httpApi: Api = {
  login: (loginId, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  createTrack: (url) =>
    request('/tracks', { method: 'POST', body: JSON.stringify({ url }) }),
  getJob: (jobId) => request(`/jobs/${encodeURIComponent(jobId)}`),
  createExport: (edit) =>
    request('/exports', { method: 'POST', body: JSON.stringify(edit) }),
  downloadUrl: (exportId) =>
    `${BASE}/exports/${encodeURIComponent(exportId)}/download`,
  audioUrl: (trackId) => `${BASE}/tracks/${encodeURIComponent(trackId)}/audio`,
  getPeaks: (trackId) => request(`/tracks/${encodeURIComponent(trackId)}/peaks`),
}

/** 백엔드 없이 화면을 볼 때: `npm run dev:mock` */
export const api: Api = import.meta.env.VITE_USE_MOCK === '1' ? mockApi : httpApi
