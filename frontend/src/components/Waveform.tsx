// 잘라내기 파형 — wavesurfer.js로 서버 peaks를 그리기만 하고, 남길 부분은 파란 겹침으로 표시.
// docs/wireframes/html/Trim.html. 양 끝 손잡이는 마우스로 끌거나 키보드로 옮긴다 (결정 63, 버튼은 그대로)
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { api } from '../api/client'
import { formatClock, formatKoreanDuration } from '../lib/format'
import { KEY_STEP, KEY_STEP_BIG, MIN_KEEP, type Edge } from '../lib/trim'

interface Props {
  trackId: string
  durationSec: number
  start: number
  end: number
  /** 손잡이를 잡았을 때 (미리듣기 멈춤) */
  onGrab: () => void
  /** 손잡이를 sec 위치로 (끄는 중) */
  onPlace: (edge: Edge, sec: number) => void
  /** 키보드로 delta초 */
  onNudge: (edge: Edge, delta: number) => void
}

export function Waveform({ trackId, durationSec, start, end, onGrab, onPlace, onNudge }: Props) {
  const waveRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState<Edge | null>(null)

  useEffect(() => {
    let ws: WaveSurfer | null = null
    let cancelled = false
    setReady(false)
    api
      .getPeaks(trackId)
      .then((data) => {
        if (cancelled || !boxRef.current) return
        ws = WaveSurfer.create({
          container: boxRef.current,
          peaks: [data.peaks],
          duration: data.durationSec,
          height: 112,
          waveColor: '#BDBDB7',
          progressColor: '#BDBDB7',
          cursorWidth: 0,
          barWidth: 5,
          barGap: 5,
          normalize: true,
          interact: false,
        })
        setReady(true)
      })
      // 파형이 없어도 버튼 · 손잡이로 자를 수 있으므로 빈 칸으로 둔다
      .catch(() => undefined)
    return () => {
      cancelled = true
      ws?.destroy()
    }
  }, [trackId])

  const left = (start / durationSec) * 100
  const right = 100 - (end / durationSec) * 100
  /** 끄는 손잡이와, 잡은 곳 - 손잡이 중심(px) — 잡자마자 튀지 않게 */
  const drag = useRef<{ edge: Edge; offset: number } | null>(null)

  /** 글자 크게(zoom)에서도 clientX와 getBoundingClientRect는 같은 좌표계 (e2e로 확인) */
  function edgeX(rect: DOMRect, sec: number) {
    return rect.left + (rect.width * sec) / durationSec
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    const grip = (e.target as HTMLElement).closest<HTMLElement>('.wave__grip')
    if (!grip || e.button !== 0) return
    e.preventDefault()
    const rect = waveRef.current!.getBoundingClientRect()
    // 두 손잡이의 잡는 범위가 겹치면 누른 곳에 더 가까운 쪽
    const toStart = Math.abs(e.clientX - edgeX(rect, start))
    const toEnd = Math.abs(e.clientX - edgeX(rect, end))
    const edge: Edge = toStart === toEnd ? (grip.dataset.edge as Edge) : toStart < toEnd ? 'start' : 'end'
    drag.current = { edge, offset: e.clientX - edgeX(rect, edge === 'start' ? start : end) }
    waveRef.current!.querySelector<HTMLElement>(`.wave__grip--${edge}`)?.focus()
    e.currentTarget.setPointerCapture(e.pointerId)
    onGrab()
    setDragging(edge)
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const rect = waveRef.current!.getBoundingClientRect()
    onPlace(d.edge, ((e.clientX - d.offset - rect.left) / rect.width) * durationSec)
  }

  function up() {
    if (!drag.current) return
    drag.current = null
    setDragging(null)
  }

  const common = { durationSec, onPlace, onNudge }

  return (
    <div
      className="wave"
      ref={waveRef}
      data-ready={ready || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      <div className="wave__bars" ref={boxRef} aria-hidden="true" />
      <div className="wave__keep" style={{ left: `${left}%`, right: `${right}%` }} aria-hidden="true" />
      <Handle {...common} edge="start" sec={start} pct={left} min={0} max={end - MIN_KEEP} label="시작 손잡이" />
      <Handle {...common} edge="end" sec={end} pct={100 - right} min={start + MIN_KEEP} max={durationSec} label="끝 손잡이" />
      {dragging && (
        <div
          className="wave__time"
          style={{ left: `clamp(48px, ${dragging === 'start' ? left : 100 - right}%, calc(100% - 48px))` }}
          aria-hidden="true"
        >
          {formatClock(dragging === 'start' ? start : end)}
        </div>
      )}
    </div>
  )
}

interface HandleProps {
  edge: Edge
  sec: number
  /** 파형 왼쪽에서의 위치 (%) */
  pct: number
  min: number
  max: number
  label: string
  durationSec: number
  onPlace: (edge: Edge, sec: number) => void
  onNudge: (edge: Edge, delta: number) => void
}

/** 잡는 범위 64px(결정 63: 48px 이상) — 남길 부분 쪽으로 넓게 잡아 맨 끝에 있어도 파형 안에서 52px */
function Handle({ edge, sec, pct, min, max, label, durationSec, onPlace, onNudge }: HandleProps) {
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onNudge(edge, -step)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onNudge(edge, step)
    else if (e.key === 'Home') onPlace(edge, 0)
    else if (e.key === 'End') onPlace(edge, durationSec)
    else return
    e.preventDefault()
  }

  return (
    <div
      className={`wave__grip wave__grip--${edge}`}
      data-edge={edge}
      style={{ left: `${pct}%` }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={sec}
      aria-valuetext={formatKoreanDuration(sec)}
      onKeyDown={key}
    >
      <div className="wave__handle" />
    </div>
  )
}
