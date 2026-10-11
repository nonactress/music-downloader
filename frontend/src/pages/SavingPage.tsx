// 저장 대기 — ② 화면 재사용 (PLAN 결정 16). 내보내기 작업 0→100, done이면 ⑦
import { useEffect } from 'react'
import { ProgressScreen } from '../components/ProgressScreen'
import { usePollJob } from '../hooks/usePollJob'
import { formatKoreanDuration } from '../lib/format'
import { resultDuration, useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function SavingPage() {
  const exportJobId = useFlowStore((s) => s.exportJobId)
  const goEdit = useFlowStore((s) => s.goEdit)
  const finish = useFlowStore((s) => s.finish)
  const edit = useEditStore((s) => s.edit)
  const trackInfo = useEditStore((s) => s.trackInfo)
  const { job, error } = usePollJob(exportJobId)

  useEffect(() => {
    if (job?.kind === 'export' && job.status === 'done' && job.result) finish(job.result)
  }, [job, finish])

  const first = edit.tracks[0] ? trackInfo[edit.tracks[0].sourceId] : undefined
  const more = edit.tracks.length - 1

  return (
    <ProgressScreen
      step={3}
      heading="노래를 만들고 있어요"
      thumbnailUrl={first?.thumbnailUrl}
      title={first ? (more > 0 ? `${first.title} 외 ${more}곡` : first.title) : '내 노래'}
      sub={`노래 ${edit.tracks.length}곡 · ${formatKoreanDuration(resultDuration(edit))}`}
      percent={job?.progress ?? 0}
      etaSeconds={job && job.status !== 'done' ? job.etaSeconds : null}
      notice={
        <>
          이 창을 닫지 말고 잠시만 기다려 주세요. 다 되면 <b>자동으로 저장 화면</b>으로 넘어가요.
        </>
      }
      error={error}
      onCancel={goEdit}
      onRetry={goEdit}
    />
  )
}
