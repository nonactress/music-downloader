// ② 불러오는 중 — docs/wireframes/html/Loading.html
// 추출 작업만 0→100, done이면 노래를 목록에 넣고 ③ 편집 홈으로 (결정 21)
// 붙이기(결정 36): 헤더 2단계, 다 되면 ③ 맨 아래에 붙음, 취소 · 다시 해보기는 ③으로
import { useEffect, useState } from 'react'
import type { TrackInfo } from '../api/types'
import { ProgressScreen } from '../components/ProgressScreen'
import { usePollJob } from '../hooks/usePollJob'
import { formatKoreanDuration } from '../lib/format'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function LoadingPage() {
  const extractJobId = useFlowStore((s) => s.extractJobId)
  const mode = useFlowStore((s) => s.extractMode)
  const goImport = useFlowStore((s) => s.goImport)
  const goEdit = useFlowStore((s) => s.goEdit)
  const { job, error } = usePollJob(extractJobId)
  const [track, setTrack] = useState<TrackInfo | null>(null)

  useEffect(() => {
    if (job?.kind !== 'extract') return
    if (job.track) setTrack(job.track)
    if (job.status === 'done' && job.result) {
      if (mode === 'append') {
        useEditStore.getState().appendTrack(job.result.track)
        useFlowStore.setState({ appendUrl: '' })
      } else {
        useEditStore.getState().addTrack(job.result.track)
      }
      goEdit()
    }
  }, [job, mode, goEdit])

  const back = mode === 'append' ? goEdit : goImport

  return (
    <ProgressScreen
      step={mode === 'append' ? 2 : 1}
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
      onCancel={back}
      onRetry={back}
    />
  )
}
