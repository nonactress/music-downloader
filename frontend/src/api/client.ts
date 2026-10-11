import type {
  CreateExportResponse,
  CreateTrackResponse,
  EditJson,
  Job,
} from './types'
import { ApiError, FALLBACK_ERROR } from './errors'
import { mockApi } from './mock'

const BASE = '/api'

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
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(body?.error ?? FALLBACK_ERROR, res.status)
  }
  return body as T
}

export interface Api {
  createTrack(url: string): Promise<CreateTrackResponse>
  getJob(jobId: string): Promise<Job>
  createExport(edit: EditJson): Promise<CreateExportResponse>
  downloadUrl(exportId: string): string
  audioUrl(trackId: string): string
}

const httpApi: Api = {
  createTrack: (url) =>
    request('/tracks', { method: 'POST', body: JSON.stringify({ url }) }),
  getJob: (jobId) => request(`/jobs/${encodeURIComponent(jobId)}`),
  createExport: (edit) =>
    request('/exports', { method: 'POST', body: JSON.stringify(edit) }),
  downloadUrl: (exportId) =>
    `${BASE}/exports/${encodeURIComponent(exportId)}/download`,
  audioUrl: (trackId) => `${BASE}/tracks/${encodeURIComponent(trackId)}/audio`,
}

/** 백엔드 없이 화면을 볼 때: `npm run dev:mock` */
export const api: Api = import.meta.env.VITE_USE_MOCK === '1' ? mockApi : httpApi
