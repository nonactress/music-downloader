// ② 불러오는 중 — docs/wireframes/html/Loading.html
// 1단계 흐름: 추출 작업 → (done) 기본 Edit JSON으로 POST /exports → 내보내기 작업 → (done) ⑦
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import type { Job, TrackInfo } from '../api/types'
import { ErrorBox } from '../components/ErrorBox'
import { Page } from '../components/Page'
import { formatKoreanDuration } from '../lib/format'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

const POLL_MS = 1000

/** 진행 막대는 한 번만 0→100으로 간다: 추출 0~80%, 내보내기 80~100% */
const EXTRACT_SHARE = 0.8

type Phase = 'extract' | 'export'

export function LoadingPage() {
  const extractJobId = useFlowStore((s) => s.extractJobId)
  const goImport = useFlowStore((s) => s.goImport)
  const finish = useFlowStore((s) => s.finish)

  const [phase, setPhase] = useState<Phase>('extract')
  const [job, setJob] = useState<Job | null>(null)
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!extractJobId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let jobId = extractJobId

    const fail = (message: string) => {
      if (!stopped) setError(message)
    }

    async function tick() {
      let next: Job
      try {
        next = await api.getJob(jobId)
      } catch (e) {
        return fail(toUserMessage(e))
      }
      if (stopped) return
      setJob(next)

      if (next.kind === 'extract' && next.track) setTrack(next.track)
      if (next.status === 'failed') {
        return fail(next.error?.message ?? toUserMessage(null))
      }

      if (next.status === 'done') {
        if (next.kind === 'extract' && next.result) {
          setTrack(next.result.track)
          useEditStore.getState().addTrack(next.result.track)
          try {
            const created = await api.createExport(useEditStore.getState().edit)
            if (stopped) return
            jobId = created.jobId
            setPhase('export')
          } catch (e) {
            return fail(toUserMessage(e))
          }
        } else if (next.kind === 'export' && next.result) {
          finish(next.result)
          return
        }
      }
      timer = setTimeout(tick, POLL_MS)
    }

    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [extractJobId, finish])

  const jobProgress = job && job.kind === phase ? job.progress : 0
  const percent = Math.floor(
    phase === 'extract'
      ? jobProgress * EXTRACT_SHARE
      : EXTRACT_SHARE * 100 + jobProgress * (1 - EXTRACT_SHARE),
  )
  const eta = job && job.kind === phase && job.status !== 'done' ? job.etaSeconds : null

  return (
    <Page step={1}>
      <main className="loading">
        <h1 className="h1">노래를 가져오고 있어요</h1>

        <div className="loading__card">
          {track?.thumbnailUrl ? (
            <img className="loading__thumb" src={track.thumbnailUrl} alt="" />
          ) : (
            <div className="loading__thumb" aria-hidden="true" />
          )}
          <div className="loading__info">
            <div className="loading__meta">
              <div className="loading__title">{track ? track.title : '노래 정보를 읽고 있어요'}</div>
              {track && (
                <div className="loading__sub">
                  {track.channel} · {formatKoreanDuration(track.durationSec)}
                </div>
              )}
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-label="진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <div className="loading__status" aria-live="polite">
              <span className="loading__percent">{percent}% 완료</span>
              {eta !== null && !error && <span className="loading__eta">약 {eta}초 남았어요</span>}
            </div>
          </div>
        </div>

        {error ? (
          <ErrorBox message={error} />
        ) : (
          <div className="notice">
            이 창을 닫지 말고 잠시만 기다려 주세요. 다 되면 <b>자동으로 편집 화면</b>으로 넘어가요.
          </div>
        )}

        <div className="loading__actions">
          {error ? (
            <button type="button" className="btn-primary loading__retry" onClick={goImport}>
              다시 해보기
            </button>
          ) : (
            <button type="button" className="btn-outline loading__cancel" onClick={goImport}>
              취소하고 돌아가기
            </button>
          )}
        </div>
      </main>
    </Page>
  )
}
