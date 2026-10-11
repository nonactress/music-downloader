// ③ 편집 홈 — docs/wireframes/html/Edit.html
// 2단계 범위: [빠르기], [위로][아래로][빼기], 노래 하나 더 붙이기, "모든 노래에 한 번에 적용"은 숨김 (결정 17)
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import type { EditTrack } from '../api/types'
import { ChangeNotice } from '../components/ChangeNotice'
import { ErrorBox } from '../components/ErrorBox'
import { ArrowRightIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { SongCard } from '../components/SongCard'
import { formatKoreanDuration } from '../lib/format'
import { usePreview, type Segment } from '../lib/preview'
import {
  initialEdit, isSameEdit, resultDuration, selectLastChange, useEditStore,
} from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

const toSegment = (t: EditTrack): Segment => ({
  src: api.audioUrl(t.sourceId),
  start: t.start,
  end: t.end,
  speed: t.speed,
  keepPitch: t.keepPitch,
})

export function EditPage() {
  const edit = useEditStore((s) => s.edit)
  const trackInfo = useEditStore((s) => s.trackInfo)
  const lastChange = useEditStore(selectLastChange)
  const goImport = useFlowStore((s) => s.goImport)
  const openTrim = useFlowStore((s) => s.openTrim)
  const startSaving = useFlowStore((s) => s.startSaving)
  const playingKey = usePreview((s) => s.playingKey)
  const togglePreview = usePreview((s) => s.toggle)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (edit.tracks.length === 0) goImport()
  }, [edit.tracks.length, goImport])

  useEffect(() => () => usePreview.getState().stop(), [])

  const initial = initialEdit(edit, trackInfo)
  const atInitial = isSameEdit(edit, initial)

  function undo() {
    usePreview.getState().stop()
    useEditStore.getState().undo()
  }

  function resetAll() {
    usePreview.getState().stop()
    useEditStore.getState().commit(initial, { prefix: '모든 노래를 처음 상태로 되돌렸어요' })
  }

  async function save() {
    if (saving) return
    usePreview.getState().stop()
    setSaving(true)
    setSaveError(null)
    try {
      const { jobId } = await api.createExport(useEditStore.getState().edit)
      startSaving(jobId)
    } catch (e) {
      setSaveError(toUserMessage(e))
      setSaving(false)
    }
  }

  // 와이어프레임 최소 높이 1240px은 숨긴 영역(결정 17)까지 있을 때 값 — 2단계는 기본 960px
  return (
    <Page step={2}>
      <main className="edit">
        {lastChange && <ChangeNotice change={lastChange} onUndo={undo} />}

        <div className="edit__title">
          <h1 className="edit__h1">노래를 다듬어 주세요</h1>
          <p className="edit__lead">고치고 싶은 노래의 버튼을 누르세요. 노래는 위에서부터 순서대로 이어져요.</p>
        </div>

        <div className="edit__list">
          {edit.tracks.map((t, i) => {
            const info = trackInfo[t.sourceId]
            if (!info) return null
            const key = `track-${i}`
            return (
              <SongCard
                key={`${t.sourceId}-${i}`}
                index={i}
                track={t}
                info={info}
                justChanged={lastChange?.trackIndex === i}
                playing={playingKey === key}
                onPlay={() => togglePreview(key, [toSegment(t)])}
                onTrim={() => {
                  usePreview.getState().stop()
                  openTrim(i)
                }}
              />
            )
          })}
        </div>

        {saveError && <ErrorBox message={saveError} />}

        <div className="edit__footer">
          <div className="edit__footer-left">
            <div className="edit__total">
              전체 길이 <b>{formatKoreanDuration(resultDuration(edit))}</b>
            </div>
            <button
              type="button"
              className="btn-outline edit__play-all"
              onClick={() => togglePreview('all', edit.tracks.map(toSegment))}
              aria-pressed={playingKey === 'all'}
            >
              {playingKey === 'all' ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
              {playingKey === 'all' ? '멈추기' : '전체 들어보기'}
            </button>
            <button type="button" className="text-btn" onClick={resetAll} disabled={atInitial}>
              처음 상태로 되돌리기
            </button>
          </div>
          <button type="button" className="edit__save" onClick={save} disabled={saving}>
            다 됐어요, 저장하기
            <ArrowRightIcon />
          </button>
        </div>
      </main>
    </Page>
  )
}
