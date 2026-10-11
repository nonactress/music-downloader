// ③ 편집 홈 — docs/wireframes/html/Edit.html
// 4단계: 와이어프레임 전체 영역 + 최소 높이 1240px (결정 43)
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import type { EditTrack } from '../api/types'
import { AppendBox } from '../components/AppendBox'
import { ChangeNotice } from '../components/ChangeNotice'
import { ErrorBox } from '../components/ErrorBox'
import { ArrowRightIcon, GaugeIcon, GridIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { SongCard } from '../components/SongCard'
import { formatKoreanDuration } from '../lib/format'
import { eulReul } from '../lib/josa'
import { moveTrack, removeTrack } from '../lib/reorder'
import { usePreview, withFades, type Segment } from '../lib/preview'
import {
  DEFAULT_CROSSFADE, initialEdit, isSameEdit, resultDuration, selectLastChange, trackDuration, useEditStore,
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
  const openSpeed = useFlowStore((s) => s.openSpeed)
  const openSpeedAll = useFlowStore((s) => s.openSpeedAll)
  const startSaving = useFlowStore((s) => s.startSaving)
  const playingKey = usePreview((s) => s.playingKey)
  const togglePreview = usePreview((s) => s.toggle)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (edit.tracks.length === 0) goImport()
  }, [edit.tracks.length, goImport])

  useEffect(() => () => usePreview.getState().stop(), [])

  // 원인을 고치면(잇기 끔 · 노래 뺌 · 더 길게 자름 …) 저장 안내는 지운다 — 서버 4xx 안내도 같이
  useEffect(() => setSaveError(null), [edit])

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

  /** 결정 38: 누르는 즉시 반영, 한 번 = 되돌리기 1번 */
  function move(from: number, to: number) {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    const t = store.edit.tracks[from]
    const title = store.trackInfo[t.sourceId]?.title ?? ''
    const next = moveTrack(store.edit, from, to)
    if (next === store.edit) return
    store.commit(next, { prefix: `「${title}」${eulReul(title)} ${to + 1}번으로 옮겼어요`, trackIndex: to })
  }

  function remove(index: number) {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    const t = store.edit.tracks[index]
    const title = store.trackInfo[t.sourceId]?.title ?? ''
    const next = removeTrack(store.edit, index)
    if (next === store.edit) return
    store.commit(next, { prefix: `「${title}」${eulReul(title)} 뺐어요` })
  }

  /** 결정 39: 체크도 즉시 반영 + 되돌리기 1번 */
  function setCrossfade(on: boolean) {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    store.commit(
      { ...store.edit, crossfade: on ? DEFAULT_CROSSFADE : 0 },
      { prefix: `노래 사이 부드럽게 잇기를 ${on ? '켰어요' : '껐어요'}` },
    )
  }

  function setNormalize(on: boolean) {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    store.commit({ ...store.edit, normalize: on }, { prefix: `소리 크기 고르게 맞추기를 ${on ? '켰어요' : '껐어요'}` })
  }

  async function save() {
    if (saving) return
    usePreview.getState().stop()
    // 결정 40: 잇기 길이보다 짧은 노래가 있으면 서버에 보내지 않음 (CONTRACT 3-2)
    const current = useEditStore.getState().edit
    if (current.crossfade > 0 && current.tracks.length >= 2) {
      const short = current.tracks.findIndex((t) => trackDuration(t) <= current.crossfade)
      if (short >= 0) {
        setSaveError(
          `${short + 1}번 노래가 너무 짧아서 부드럽게 이을 수 없어요. 더 길게 남기거나 [노래 사이 부드럽게 잇기]를 꺼 주세요.`,
        )
        return
      }
    }
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

  return (
    <Page step={2} minHeight={1240}>
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
                justChanged={!!lastChange && (lastChange.allTracks || lastChange.trackIndex === i)}
                playing={playingKey === key}
                onPlay={() => togglePreview(key, [toSegment(t)])}
                onTrim={() => {
                  usePreview.getState().stop()
                  openTrim(i)
                }}
                onSpeed={() => {
                  usePreview.getState().stop()
                  openSpeed(i)
                }}
                count={edit.tracks.length}
                onUp={() => move(i, i - 1)}
                onDown={() => move(i, i + 1)}
                onRemove={() => remove(i)}
              />
            )
          })}

          <AppendBox count={edit.tracks.length} onStart={() => usePreview.getState().stop()} />
        </div>

        <section className="apply-all" aria-labelledby="apply-all-title">
          <h2 className="apply-all__title" id="apply-all-title">
            <GridIcon />
            모든 노래에 한 번에 적용
          </h2>
          <div className="apply-all__row">
            <button
              type="button"
              className="apply-all__tile"
              onClick={() => {
                usePreview.getState().stop()
                openSpeedAll(null)
              }}
            >
              <GaugeIcon size={30} />
              <span className="apply-all__text">
                <span className="apply-all__name">모든 노래 빠르기 바꾸기</span>
                <span className="apply-all__sub">전체를 같은 빠르기로</span>
              </span>
            </button>
            <label className="apply-all__tile apply-all__check">
              <input type="checkbox" checked={edit.crossfade > 0} onChange={(e) => setCrossfade(e.target.checked)} />
              <span className="apply-all__text">
                <span className="apply-all__name">노래 사이 부드럽게 잇기</span>
                <span className="apply-all__sub">끝나고 다음 곡이 자연스럽게</span>
              </span>
            </label>
            <label className="apply-all__tile apply-all__check">
              <input type="checkbox" checked={edit.normalize} onChange={(e) => setNormalize(e.target.checked)} />
              <span className="apply-all__text">
                <span className="apply-all__name">소리 크기 고르게 맞추기</span>
                <span className="apply-all__sub">곡마다 소리 크기가 달라도 비슷하게</span>
              </span>
            </label>
          </div>
        </section>

        {saveError && <ErrorBox message={saveError} />}

        <div className="edit__footer">
          <div className="edit__footer-left">
            <div className="edit__total">
              전체 길이 <b>{formatKoreanDuration(resultDuration(edit))}</b>
            </div>
            <button
              type="button"
              className="btn-outline edit__play-all"
              onClick={() => togglePreview('all', withFades(edit.tracks.map(toSegment), edit.crossfade > 0))}
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
