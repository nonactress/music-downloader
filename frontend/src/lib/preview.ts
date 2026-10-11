// 브라우저 미리듣기 — <audio> 하나로 구간(start~end)을 playbackRate + preservesPitch로 재생.
// 서버 렌더링 없음 (CLAUDE.md). 여러 구간이면 순서대로 이어서 재생한다.
import { create } from 'zustand'

export interface Segment {
  src: string
  start: number
  end: number
  speed: number
  keepPitch: boolean
}

interface PreviewStore {
  /** 지금 재생 중인 버튼의 키 (예: "track-0", "all") */
  playingKey: string | null
  toggle: (key: string, segments: Segment[]) => void
  stop: () => void
}

let audio: HTMLAudioElement | null = null
let queue: Segment[] = []
let index = 0
let frame = 0
let runId = 0

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.addEventListener('ended', () => next())
    audio.addEventListener('error', () => usePreview.getState().stop())
  }
  return audio
}

function watchEnd(id: number) {
  cancelAnimationFrame(frame)
  const tick = () => {
    if (id !== runId || !audio) return
    const seg = queue[index]
    if (seg && audio.currentTime >= seg.end) {
      next()
      return
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}

async function playAt(i: number, id: number) {
  const a = getAudio()
  const seg = queue[i]
  if (!seg) {
    usePreview.getState().stop()
    return
  }
  index = i
  const url = new URL(seg.src, location.href).href
  if (a.src !== url) {
    a.src = url
    await new Promise<void>((resolve, reject) => {
      const ok = () => { cleanup(); resolve() }
      const fail = () => { cleanup(); reject(new Error('load')) }
      const cleanup = () => {
        a.removeEventListener('loadedmetadata', ok)
        a.removeEventListener('error', fail)
      }
      a.addEventListener('loadedmetadata', ok)
      a.addEventListener('error', fail)
    }).catch(() => undefined)
    if (id !== runId) return
  }
  // src를 바꾸면 playbackRate가 defaultPlaybackRate로 돌아가므로 둘 다 맞춘다
  a.defaultPlaybackRate = seg.speed
  a.playbackRate = seg.speed
  a.preservesPitch = seg.keepPitch
  a.currentTime = seg.start
  try {
    await a.play()
  } catch {
    if (id === runId) usePreview.getState().stop()
    return
  }
  if (id === runId) watchEnd(id)
}

function next() {
  if (index + 1 < queue.length) void playAt(index + 1, runId)
  else usePreview.getState().stop()
}

export const usePreview = create<PreviewStore>((set, get) => ({
  playingKey: null,

  toggle: (key, segments) => {
    if (get().playingKey === key) {
      get().stop()
      return
    }
    get().stop()
    if (segments.length === 0) return
    queue = segments
    runId += 1
    set({ playingKey: key })
    void playAt(0, runId)
  },

  stop: () => {
    runId += 1
    cancelAnimationFrame(frame)
    audio?.pause()
    queue = []
    set({ playingKey: null })
  },
}))
