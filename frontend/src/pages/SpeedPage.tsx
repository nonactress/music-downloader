// ⑤ 한 곡 빠르기 — docs/wireframes/html/Speed.html
// 누르는 즉시 Edit JSON에 반영(setLive), 화면을 나갈 때 변경 전체 = 되돌리기 1번 (결정 28)
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { EditTrack } from '../api/types'
import { ArrowLeftIcon, CheckIcon, PauseIcon, PlayIcon, UndoIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { ScopeChoice } from '../components/ScopeChoice'
import { SpeedControls } from '../components/SpeedControls'
import { formatKoreanDuration } from '../lib/format'
import { usePreview } from '../lib/preview'
import { isSameSpeed, speedWithRate } from '../lib/speed'
import { trackDuration, useEditStore, type Change } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function SpeedPage() {
  const index = useFlowStore((s) => s.songIndex)
  const goEdit = useFlowStore((s) => s.goEdit)
  const openSpeedAll = useFlowStore((s) => s.openSpeedAll)
  const edit = useEditStore((s) => s.edit)
  const trackInfo = useEditStore((s) => s.trackInfo)
  const playingKey = usePreview((s) => s.playingKey)
  const togglePreview = usePreview((s) => s.toggle)
  /** 이 화면에 들어오기 전 노래 — [되돌리기]가 돌아갈 곳 */
  const [before] = useState(() => useEditStore.getState().edit)

  const track = edit.tracks[index]
  const info = track ? trackInfo[track.sourceId] : undefined

  useEffect(() => {
    if (!track || !info) goEdit()
  }, [track, info, goEdit])

  useEffect(() => () => usePreview.getState().stop(), [])

  if (!track || !info) return null
  const n = index + 1
  const atOriginal = isSameSpeed(track.speed, 1) && track.keepPitch

  function update(next: EditTrack) {
    usePreview.getState().stop()
    const current = useEditStore.getState().edit
    const tracks = current.tracks.map((t, i) => (i === index ? next : t))
    useEditStore.getState().setLive({ ...current, tracks })
  }

  /** 화면을 나갈 때 한 번에 기록 */
  function record() {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    const was = before.tracks[index]
    const now = store.edit.tracks[index]
    if (!was || !now) return
    const speedChanged = !isSameSpeed(was.speed, now.speed)
    if (!speedChanged && was.keepPitch === now.keepPitch) return
    // 결정 27 문구. 높낮이만 바꿨으면 그 내용으로
    const change: Change = speedChanged
      ? { prefix: `${n}번 노래 빠르기를 `, emphasis: speedWithRate(now.speed), suffix: '로 바꿨어요', trackIndex: index }
      : {
          prefix: `${n}번 노래 목소리 높낮이를 `,
          emphasis: now.keepPitch ? '그대로 두게' : '빠르기에 따라 바뀌게',
          suffix: ' 바꿨어요',
          trackIndex: index,
        }
    store.recordSince(before, change)
  }

  function finish() {
    record()
    goEdit()
  }

  return (
    <Page step={2} minHeight={1000}>
      <main className="song-screen">
        <button type="button" className="btn-outline back-btn" onClick={finish}>
          <ArrowLeftIcon />
          노래 목록으로
        </button>

        <div className="song-screen__head">
          <div className="song-screen__num" aria-hidden="true">{n}</div>
          <div className="song-screen__titles">
            <h1 className="song-screen__h1">{n}번 노래 빠르기</h1>
            <div className="song-screen__sub">
              {info.title} · {formatKoreanDuration(track.end - track.start)}
            </div>
          </div>
        </div>

        <section className="speed-panel">
          <ScopeChoice
            value="one"
            allLabel="모든 노래"
            onOne={() => undefined}
            onAll={() => {
              record()
              openSpeedAll(index)
            }}
          />

          <SpeedControls
            speed={track.speed}
            keepPitch={track.keepPitch}
            onSpeed={(speed) => update({ ...track, speed })}
            onKeepPitch={(keepPitch) => update({ ...track, keepPitch })}
          />

          <div className="speed-result">
            <div className="speed-result__len">
              바뀐 길이 <b>{formatKoreanDuration(trackDuration(track))}</b>{' '}
              <span className="trim__hint">(바꾸는 즉시 반영돼요)</span>
            </div>
            <button
              type="button"
              className="btn-outline song-screen__play"
              aria-pressed={playingKey === 'speed'}
              onClick={() =>
                togglePreview('speed', [
                  {
                    src: api.audioUrl(track.sourceId),
                    start: track.start,
                    end: track.end,
                    speed: track.speed,
                    keepPitch: track.keepPitch,
                  },
                ])
              }
            >
              {playingKey === 'speed' ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
              {playingKey === 'speed' ? '멈추기' : '들어보기'}
            </button>
          </div>
        </section>

        <div className="song-screen__footer">
          <button
            type="button"
            className="text-btn trim__cancel"
            disabled={atOriginal}
            onClick={() => update({ ...track, speed: 1, keepPitch: true })}
          >
            <UndoIcon />
            원래 빠르기로 되돌리기
          </button>
          <button type="button" className="btn-primary song-screen__done" onClick={finish}>
            <CheckIcon size={26} />
            완료, 목록으로
          </button>
        </div>
      </main>
    </Page>
  )
}
