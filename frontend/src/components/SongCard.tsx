// 노래 카드 — docs/wireframes/html/Edit.html
// [위로][아래로][빼기]: 맨 위 [위로] · 맨 아래 [아래로] 비활성, 1곡이면 [빼기] 비활성 (결정 38)
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
  /** 목록 전체 곡 수 — 끝 버튼 비활성에 씀 */
  count: number
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}

export function SongCard(p: Props) {
  const { index, track, info, justChanged, playing, onPlay, onTrim, onSpeed, count } = p
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
        <div className="song-card__order">
          <button type="button" className="order-btn" onClick={p.onUp} disabled={index === 0}>위로</button>
          <button type="button" className="order-btn" onClick={p.onDown} disabled={index === count - 1}>아래로</button>
          <button type="button" className="order-btn order-btn--danger" onClick={p.onRemove} disabled={count <= 1}>빼기</button>
        </div>
      </div>
    </article>
  )
}
