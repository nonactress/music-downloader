// 잘라내기 파형 — wavesurfer.js로 서버 peaks를 그리기만 하고, 남길 부분은 파란 겹침으로 표시.
// docs/wireframes/html/Trim.html (파형 드래그 없음 — 버튼으로 조작)
import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { api } from '../api/client'

interface Props {
  trackId: string
  durationSec: number
  start: number
  end: number
}

export function Waveform({ trackId, durationSec, start, end }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

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
      // 파형이 없어도 버튼으로 자를 수 있으므로 빈 칸으로 둔다
      .catch(() => undefined)
    return () => {
      cancelled = true
      ws?.destroy()
    }
  }, [trackId])

  const left = (start / durationSec) * 100
  const right = 100 - (end / durationSec) * 100

  return (
    <div className="wave" data-ready={ready || undefined} aria-hidden="true">
      <div className="wave__bars" ref={boxRef} />
      <div className="wave__keep" style={{ left: `${left}%`, right: `${right}%` }} />
      <div className="wave__handle" style={{ left: `calc(${left}% - 18px)` }} />
      <div className="wave__handle" style={{ right: `calc(${right}% - 18px)` }} />
    </div>
  )
}
