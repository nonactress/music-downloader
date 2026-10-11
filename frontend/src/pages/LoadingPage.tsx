// ② 불러오는 중 — docs/wireframes/html/Loading.html
// 추출 작업만 0→100, done이면 노래를 목록에 넣고 ③ 편집 홈으로 (결정 21)
import { useEffect, useState } from 'react'
import type { TrackInfo } from '../api/types'
import { ProgressScreen } from '../components/ProgressScreen'
import { usePollJob } from '../hooks/usePollJob'
import { formatKoreanDuration } from '../lib/format'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function LoadingPage() {
  const extractJobId = useFlowStore((s) => s.extractJobId)
  const goImport = useFlowStore((s) => s.goImport)
  const goEdit = useFlowStore((s) => s.goEdit)
  const { job, error } = usePollJob(extractJobId)
  const [track, setTrack] = useState<TrackInfo | null>(null)

  useEffect(() => {
    if (job?.kind !== 'extract') return
    if (job.track) setTrack(job.track)
    if (job.status === 'done' && job.result) {
      useEditStore.getState().addTrack(job.result.track)
      goEdit()
    }
  }, [job, goEdit])

  return (
    <ProgressScreen
      step={1}
      heading="노래를 가져오고 있어요"
      thumbnailUrl={track?.thumbnailUrl}
      title={track ? track.title : '노래 정보를 읽고 있어요'}
      sub={track ? `${track.channel} · ${formatKoreanDuration(track.durationSec)}` : undefined}
      percent={job?.progress ?? 0}
      etaSeconds={job && job.status !== 'done' ? job.etaSeconds : null}
      notice={
        <>
          이 창을 닫지 말고 잠시만 기다려 주세요. 다 되면 <b>자동으로 편집 화면</b>으로 넘어가요.
        </>
      }
      error={error}
      onCancel={goImport}
      onRetry={goImport}
    />
  )
}
