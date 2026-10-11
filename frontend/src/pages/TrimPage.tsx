// ④ 한 곡 잘라내기 — docs/wireframes/html/Trim.html
// 누르는 즉시 Edit JSON에 반영(setLive), 화면을 나갈 때 변경 전체를 되돌리기 1번으로 기록 (결정 22)
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ArrowLeftIcon, CheckIcon, PauseIcon, PlayIcon, UndoIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { TimeStepper } from '../components/TimeStepper'
import { Waveform } from '../components/Waveform'
import { formatKoreanDuration } from '../lib/format'
import { usePreview } from '../lib/preview'
import { moveTrim, trimLimits } from '../lib/trim'
import type { EditTrack } from '../api/types'
import { isSameEdit, trackDuration, trimState, useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function TrimPage() {
  const index = useFlowStore((s) => s.songIndex)
  const goEdit = useFlowStore((s) => s.goEdit)
  const edit = useEditStore((s) => s.edit)
  const trackInfo = useEditStore((s) => s.trackInfo)
  const playingKey = usePreview((s) => s.playingKey)
  const togglePreview = usePreview((s) => s.toggle)
  /** 이 화면에 들어오기 전 Edit JSON — [되돌리기]가 돌아갈 곳 */
  const [before] = useState(() => useEditStore.getState().edit)

  const track = edit.tracks[index]
  const info = track ? trackInfo[track.sourceId] : undefined

  useEffect(() => {
    if (!track || !info) goEdit()
  }, [track, info, goEdit])

  useEffect(() => () => usePreview.getState().stop(), [])

  if (!track || !info) return null
  const n = index + 1
  const limits = trimLimits(track, info.durationSec)
  const untrimmed = trimState(track, info.durationSec) === 'none'

  function update(next: EditTrack) {
    usePreview.getState().stop()
    const current = useEditStore.getState().edit
    const tracks = current.tracks.map((t, i) => (i === index ? next : t))
    useEditStore.getState().setLive({ ...current, tracks })
  }

  function finish() {
    usePreview.getState().stop()
    const store = useEditStore.getState()
    const now = store.edit.tracks[index]
    if (now && !isSameEdit(before, store.edit)) {
      // 결정 18 문구
      const change =
        trimState(now, info!.durationSec) === 'none'
          ? { prefix: `${n}번 노래를 원래 길이로 되돌렸어요`, trackIndex: index }
          : {
              prefix: `${n}번 노래를 `,
              emphasis: formatKoreanDuration(trackDuration(now)),
              suffix: '로 잘랐어요',
              trackIndex: index,
            }
      store.recordSince(before, change)
    }
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
            <h1 className="song-screen__h1">{n}번 노래 잘라내기</h1>
            <div className="song-screen__sub">
              {info.title} · 원래 길이 {formatKoreanDuration(info.durationSec)}
            </div>
          </div>
        </div>

        <section className="trim__panel">
          <p className="trim__guide">
            남길 부분의 <b>시작</b>과 <b>끝</b>을 정해주세요. 파란 부분만 남고 회색 부분은 잘려나가요.
          </p>

          <Waveform trackId={track.sourceId} durationSec={info.durationSec} start={track.start} end={track.end} />

          <div className="trim__steppers">
            <TimeStepper
              label="시작"
              value={track.start}
              canDown={limits.startDown}
              canUp={limits.startUp}
              onDown={() => update(moveTrim(track, info.durationSec, 'startDown'))}
              onUp={() => update(moveTrim(track, info.durationSec, 'startUp'))}
            />
            <TimeStepper
              label="끝"
              value={track.end}
              canDown={limits.endDown}
              canUp={limits.endUp}
              onDown={() => update(moveTrim(track, info.durationSec, 'endDown'))}
              onUp={() => update(moveTrim(track, info.durationSec, 'endUp'))}
            />
          </div>

          <div className="trim__result">
            <div className="trim__remain">
              남는 길이 <b>{formatKoreanDuration(trackDuration(track))}</b>{' '}
              <span className="trim__hint">(바꾸는 즉시 반영돼요)</span>
            </div>
            <button
              type="button"
              className="btn-outline song-screen__play"
              aria-pressed={playingKey === 'trim'}
              onClick={() =>
                togglePreview('trim', [
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
              {playingKey === 'trim' ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
              {playingKey === 'trim' ? '멈추기' : '남긴 부분 들어보기'}
            </button>
          </div>
        </section>

        <div className="song-screen__footer">
          <button
            type="button"
            className="text-btn trim__cancel"
            disabled={untrimmed}
            onClick={() => update({ ...track, start: 0, end: info.durationSec })}
          >
            <UndoIcon />
            이 노래 자르기 취소
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
