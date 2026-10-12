// docs/CONTRACT.md v1.7 그대로. 필드 이름 · 상태값을 바꾸지 말 것.

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type JobKind = 'extract' | 'export'

export type ErrorCode =
  | 'INVALID_URL'
  | 'PLAYLIST_NOT_ALLOWED'
  | 'TOO_LONG'
  | 'VIDEO_UNAVAILABLE'
  | 'EXTRACT_FAILED'
  | 'EXPORT_FAILED'
  | 'TIMEOUT'
  | 'INVALID_EDIT'
  | 'NOT_FOUND'
  | 'NOT_READY'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'UNAUTHORIZED'
  | 'LOGIN_FAILED'
  | 'LOGIN_LOCKED'
  | 'SAVE_FAILED'

export interface ApiErrorBody {
  code: ErrorCode | string
  message: string
  detail?: unknown
}

export interface TrackInfo {
  trackId: string
  title: string
  channel: string
  durationSec: number
  thumbnailUrl: string
}

export interface ExportResult {
  exportId: string
  fileName: string
  trackCount: number
  durationSec: number
  sizeBytes: number
}

interface JobBase {
  jobId: string
  status: JobStatus
  progress: number
  etaSeconds: number | null
  error: ApiErrorBody | null
}

export interface ExtractJob extends JobBase {
  kind: 'extract'
  track: TrackInfo | null
  result: { track: TrackInfo } | null
}

export interface ExportJob extends JobBase {
  kind: 'export'
  track: null
  result: ExportResult | null
}

export type Job = ExtractJob | ExportJob

export interface CreateTrackResponse {
  jobId: string
  trackId: string
}

export interface CreateExportResponse {
  jobId: string
  exportId: string
}

/** CONTRACT 2-4 */
export interface Peaks {
  trackId: string
  durationSec: number
  pointsPerSecond: number
  peaks: number[]
}

export interface EditTrack {
  sourceId: string
  start: number
  end: number
  speed: number
  keepPitch: boolean
}

export interface EditJson {
  tracks: EditTrack[]
  crossfade: number
  normalize: boolean
  format: 'mp3'
}

/** CONTRACT 5-2 · 5-4 */
export interface AuthUser {
  loginId: string
}

export interface AuthResponse {
  user: AuthUser
}

/** CONTRACT 5-4 · 7-2 GET /auth/me — desktop은 v1.7부터 (예전 서버는 없을 수 있음) */
export interface MeResponse extends AuthResponse {
  desktop?: boolean
}

/** CONTRACT 7-3 POST /exports/{id}/save (데스크톱만) */
export interface SaveExportResponse {
  fileName: string
  savedId: string
}
