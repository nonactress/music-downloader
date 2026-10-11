// ⑥ 모든 노래 빠르기 — docs/wireframes/html/SpeedAll.html
// 화면 안에서 고른 값은 초안(Edit JSON 안 바뀜). [모든 노래에 적용하기]에서 한 번에 덮어쓰기 = 되돌리기 1번 (결정 29)
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { EditJson } from '../api/types'
import { AlertIcon, ArrowLeftIcon, CheckIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { ScopeChoice } from '../components/ScopeChoice'
import { SpeedControls } from '../components/SpeedControls'
import { formatKoreanDuration } from '../lib/format'
import { usePreview } from '../lib/preview'
import { isSameSpeed, speedWithRate } from '../lib/speed'
import { isSameEdit, resultDuration, useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

/** 초안을 모든 노래에 덮어쓴 Edit JSON */
function withSpeed(edit: EditJson, speed: number, keepPitch: boolean): EditJson {
  return { ...edit, tracks: edit.tracks.map((t) => ({ ...t, speed, keepPitch })) }
}

export function SpeedAllPage() {
  const from = useFlowStore((s) => s.speedAllFrom)
  const goEdit = useFlowStore((s) => s.goEdit)
  const openSpeed = useFlowStore((s) => s.openSpeed)
  const edit = useEditStore((s) => s.edit)
  const playingKey = usePreview((s) => s.playingKey)
  const togglePreview = usePreview((s) => s.toggle)
  // 처음 선택은 보통(1.0배) + 높낮이 유지 (결정 29)
  const [speed, setSpeed] = useState(1)
  const [keepPitch, setKeepPitch] = useState(true)

  useEffect(() => {
    if (edit.tracks.length === 0) goEdit()
  }, [edit.tracks.length, goEdit])

  useEffect(() => () => usePreview.getState().stop(), [])

  const count = edit.tracks.length
  const draft = withSpeed(edit, speed, keepPitch)
  // 결정 30: 1배가 아닌 노래마다 한 줄
  const custom = edit.tracks
    .map((t, i) => ({ n: i + 1, speed: t.speed }))
    .filter((t) => !isSameSpeed(t.speed, 1))

  function leave() {
    usePreview.getState().stop()
    goEdit()
  }

  function apply() {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    const next = withSpeed(store.edit, speed, keepPitch)
    if (!isSameEdit(next, store.edit)) {
      store.commit(next, {
        prefix: '모든 노래 빠르기를 ',
        emphasis: speedWithRate(speed),
        suffix: '로 바꿨어요',
        allTracks: true,
      })
    }
    goEdit()
  }

  function change(fn: () => void) {
    usePreview.getState().stop()
    fn()
  }

  return (
    <Page step={2} minHeight={1000}>
      <main className="song-screen">
        <button type="button" className="btn-outline back-btn" onClick={leave}>
          <ArrowLeftIcon />
          노래 목록으로
        </button>

        <div className="page-head">
          <h1 className="page-head__h1">모든 노래 빠르기</h1>
          <div className="page-head__sub">목록에 있는 노래 {count}곡이 모두 같은 빠르기로 바뀌어요</div>
        </div>

        {custom.length > 0 && (
          <div role="note" className="warn-box">
            <AlertIcon stroke="#B4530A" />
            <div className="warn-box__body">
              <div className="warn-box__title">따로 바꾼 빠르기가 있어요</div>
              {custom.map((t) => (
                <div key={t.n} className="warn-box__line">
                  {t.n}번 노래는 지금 <b>{speedWithRate(t.speed)}</b>예요.
                </div>
              ))}
              <div className="warn-box__line">여기서 정하면 이 값 대신 새 빠르기로 바뀌어요.</div>
            </div>
          </div>
        )}

        <section className="speed-panel">
          {/* 편집 홈에서 왔으면 고를 노래가 없으므로 숨김 (결정 31) */}
          {from !== null && (
            <ScopeChoice
              value="all"
              allLabel={`모든 노래 (${count}곡)`}
              onOne={() => {
                usePreview.getState().stop()
                openSpeed(from)
              }}
              onAll={() => undefined}
            />
          )}

          <SpeedControls
            speed={speed}
            keepPitch={keepPitch}
            onSpeed={(v) => change(() => setSpeed(v))}
            onKeepPitch={(v) => change(() => setKeepPitch(v))}
          />

          <div className="speed-result">
            <div className="speed-result__len">
              전체 길이 <b>{formatKoreanDuration(resultDuration(draft))}</b>
            </div>
            <button
              type="button"
              className="btn-outline song-screen__play"
              aria-pressed={playingKey === 'speedAll'}
              onClick={() =>
                togglePreview(
                  'speedAll',
                  draft.tracks.map((t) => ({
                    src: api.audioUrl(t.sourceId),
                    start: t.start,
                    end: t.end,
                    speed: t.speed,
                    keepPitch: t.keepPitch,
                  })),
                )
              }
            >
              {playingKey === 'speedAll' ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
              {playingKey === 'speedAll' ? '멈추기' : '전체 들어보기'}
            </button>
          </div>
        </section>

        <div className="song-screen__footer">
          <button type="button" className="text-btn" onClick={leave}>
            바꾸지 않고 돌아가기
          </button>
          <button type="button" className="btn-primary song-screen__done" onClick={apply}>
            <CheckIcon size={26} />
            모든 노래에 적용하기
          </button>
        </div>
      </main>
    </Page>
  )
}
