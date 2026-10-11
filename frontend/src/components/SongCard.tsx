// 노래 카드 — docs/wireframes/html/Edit.html
// 3단계 범위: [위로][아래로][빼기]는 4단계까지 숨김 (결정 17 · 32)
import type { EditTrack, TrackInfo } from '../api/types'
import { formatKoreanDuration } from '../lib/format'
import { speedLabel, trimLabel } from '../lib/labels'
import { trackDuration, trimState } from '../store/editStore'
import { GaugeIcon, PauseIcon, PlayIcon, ScissorsIcon } from './Icons'

interface Props {
  index: number
  track: EditTrack
  info: TrackInfo
  justChanged: boolean
  playing: boolean
  onPlay: () => void
  onTrim: () => void
  onSpeed: () => void
}

export function SongCard({ index, track, info, justChanged, playing, onPlay, onTrim, onSpeed }: Props) {
  const normalSpeed = speedLabel(track.speed) === '보통 빠르기'
  return (
    <article className={`song-card${justChanged ? ' song-card--changed' : ''}`} aria-label={`${index + 1}번 노래`}>
      <div className="song-card__top">
        <div className="song-card__num" aria-hidden="true">{index + 1}</div>
        {info.thumbnailUrl ? (
          <img className="song-card__thumb" src={info.thumbnailUrl} alt="" />
        ) : (
          <div className="song-card__thumb" aria-hidden="true" />
        )}
        <div className="song-card__info">
          <div className="song-card__title-row">
            <span className="song-card__title">{info.title}</span>
            {justChanged && <span className="song-card__badge">방금 바뀜</span>}
          </div>
          <div className="song-card__sub">
            {formatKoreanDuration(trackDuration(track))}
            {trimLabel(trimState(track, info.durationSec))} ·{' '}
            {normalSpeed ? speedLabel(track.speed) : <b className="song-card__em">{speedLabel(track.speed)}</b>}
          </div>
        </div>
        <button type="button" className="btn-outline song-card__play" onClick={onPlay} aria-pressed={playing}>
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          {playing ? '멈추기' : '들어보기'}
        </button>
      </div>
      <div className="song-card__actions">
        <div className="song-card__edit">
          <button type="button" className="btn-primary song-card__btn" onClick={onTrim}>
            <ScissorsIcon />
            잘라내기
          </button>
          <button type="button" className="btn-primary song-card__btn" onClick={onSpeed}>
            <GaugeIcon />
            빠르기
          </button>
        </div>
      </div>
    </article>
  )
}
