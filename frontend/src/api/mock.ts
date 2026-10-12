// CONTRACT 형식의 목(mock) API. 백엔드 없이 화면 흐름을 확인할 때만 쓴다.
import type { Api } from './client'
import { ApiError } from './errors'
import type { EditJson, ExportJob, ExtractJob, Job, TrackInfo } from './types'
import { checkYoutubeUrl } from '../lib/youtubeUrl'

const EXTRACT_MS = 8000
const EXPORT_MS = 5000

interface MockJob {
  kind: 'extract' | 'export'
  startedAt: number
  durationMs: number
  track?: TrackInfo
  edit?: EditJson
  exportId?: string
}

const jobs = new Map<string, MockJob>()
const tracks = new Map<string, TrackInfo>()
let seq = 0
const nextId = (prefix: string) => `${prefix}_mock${++seq}`

function progressOf(job: MockJob): number {
  const p = Math.floor(((Date.now() - job.startedAt) / job.durationMs) * 100)
  return Math.max(0, Math.min(100, p))
}

function etaOf(job: MockJob): number {
  return Math.max(0, Math.ceil((job.startedAt + job.durationMs - Date.now()) / 1000))
}

function toJob(jobId: string, job: MockJob): Job {
  const progress = progressOf(job)
  const status = progress >= 100 ? 'done' : progress === 0 ? 'queued' : 'running'
  const base = {
    jobId,
    status,
    progress,
    etaSeconds: status === 'queued' ? null : etaOf(job),
    error: null,
  } as const

  if (job.kind === 'extract') {
    const track = job.track!
    const extract: ExtractJob = {
      ...base,
      kind: 'extract',
      track: progress >= 10 ? track : null,
      result: status === 'done' ? { track } : null,
    }
    return extract
  }

  const edit = job.edit!
  const durationSec = edit.tracks.reduce((sum, t) => sum + (t.end - t.start) / t.speed, 0)
  const exp: ExportJob = {
    ...base,
    kind: 'export',
    track: null,
    result:
      status === 'done'
        ? {
            exportId: job.exportId!,
            fileName: `내 노래_${mmdd(new Date())}.mp3`,
            trackCount: edit.tracks.length,
            durationSec,
            sizeBytes: Math.round(durationSec * 16000),
          }
        : null,
  }
  return exp
}

function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 1초짜리 무음 WAV — 미리듣기 · 저장 버튼이 실제로 동작하는지 확인용 */
let silentUrl: string | null = null
function silentWavUrl(): string {
  if (silentUrl) return silentUrl
  const rate = 8000
  const samples = rate
  const buf = new ArrayBuffer(44 + samples)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  str(36, 'data'); v.setUint32(40, samples, true)
  new Uint8Array(buf, 44).fill(128)
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  return silentUrl
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 목 계정 — 아이디 grandma, 비밀번호 123456 (실제 규칙처럼 6자 이상, 결정 61) */
const MOCK_ACCOUNTS: Record<string, string> = { grandma: '123456' }
/** 쿠키 대신 브라우저에 로그인 상태를 기억 (새로고침해도 로그인 유지) */
const MOCK_SESSION_KEY = 'easy-music:mock-login'
const LOCK_AFTER = 5
const failures = new Map<string, number>()

function mockSession(): string | null {
  try {
    return localStorage.getItem(MOCK_SESSION_KEY)
  } catch {
    return null
  }
}

function setMockSession(loginId: string | null) {
  try {
    if (loginId) localStorage.setItem(MOCK_SESSION_KEY, loginId)
    else localStorage.removeItem(MOCK_SESSION_KEY)
  } catch {
    // 무시
  }
}

export const mockApi: Api = {
  async login(rawId, password) {
    await wait(300)
    const loginId = rawId.trim().toLowerCase()
    if ((failures.get(loginId) ?? 0) >= LOCK_AFTER) {
      throw new ApiError({ code: 'LOGIN_LOCKED', message: '여러 번 틀려서 잠시 막혔어요. 15분 뒤에 다시 해 주세요.' }, 429)
    }
    if (MOCK_ACCOUNTS[loginId] !== password) {
      failures.set(loginId, (failures.get(loginId) ?? 0) + 1)
      throw new ApiError({ code: 'LOGIN_FAILED', message: '아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.' }, 401)
    }
    failures.delete(loginId)
    setMockSession(loginId)
    return { user: { loginId } }
  },

  async logout() {
    await wait(100)
    setMockSession(null)
  },

  async me() {
    await wait(100)
    const loginId = mockSession()
    if (!loginId) throw new ApiError({ code: 'UNAUTHORIZED', message: '로그인이 필요해요. 다시 로그인해 주세요.' }, 401)
    return { user: { loginId } }
  },

  async createTrack(url) {
    await wait(300)
    const err = checkYoutubeUrl(url)
    if (err) throw new ApiError(err, 400)
    const trackId = nextId('t')
    const jobId = nextId('j')
    const track: TrackInfo = {
      trackId,
      title: '목 데이터 노래 제목',
      channel: '목 데이터 채널',
      durationSec: 224.83,
      thumbnailUrl: '',
    }
    tracks.set(trackId, track)
    jobs.set(jobId, { kind: 'extract', startedAt: Date.now() + 500, durationMs: EXTRACT_MS, track })
    return { jobId, trackId }
  },

  async getJob(jobId) {
    await wait(100)
    const job = jobs.get(jobId)
    if (!job) {
      throw new ApiError({ code: 'NOT_FOUND', message: '노래를 찾을 수 없어요. 처음부터 다시 해주세요.' }, 404)
    }
    return toJob(jobId, job)
  },

  async createExport(edit) {
    await wait(300)
    const jobId = nextId('j')
    const exportId = nextId('e')
    jobs.set(jobId, { kind: 'export', startedAt: Date.now(), durationMs: EXPORT_MS, edit, exportId })
    return { jobId, exportId }
  },

  downloadUrl: () => silentWavUrl(),
  audioUrl: () => silentWavUrl(),

  async getPeaks(trackId) {
    await wait(200)
    const track = tracks.get(trackId)
    if (!track) {
      throw new ApiError({ code: 'NOT_FOUND', message: '노래를 찾을 수 없어요. 처음부터 다시 해주세요.' }, 404)
    }
    const pointsPerSecond = 20
    const n = Math.ceil(track.durationSec * pointsPerSecond)
    const peaks = Array.from({ length: n }, (_, i) => 0.15 + 0.7 * Math.abs(Math.sin(i / 9) * Math.cos(i / 31)))
    return { trackId, durationSec: track.durationSec, pointsPerSecond, peaks }
  },
}
