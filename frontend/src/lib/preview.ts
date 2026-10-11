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
/** 다음 구간으로 넘어가는 중 — rAF와 timeupdate가 같은 끝을 두 번 처리하지 않게 */
let advancing = false

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.addEventListener('ended', () => next())
    // 다른 탭에 가면 requestAnimationFrame이 멈추므로 timeupdate로도 끝을 확인한다 (먼저 오는 쪽)
    audio.addEventListener('timeupdate', () => checkEnd())
    audio.addEventListener('error', () => usePreview.getState().stop())
  }
  return audio
}

/** 지금 구간의 끝을 지났으면 다음으로. 넘어갔으면 true */
function checkEnd(): boolean {
  if (advancing || !audio || queue.length === 0) return false
  const seg = queue[index]
  if (seg && audio.currentTime >= seg.end) {
    next()
    return true
  }
  return false
}

function watchEnd(id: number) {
  cancelAnimationFrame(frame)
  const tick = () => {
    if (id !== runId || checkEnd()) return
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
  advancing = true
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
  advancing = false
  try {
    await a.play()
  } catch {
    if (id === runId) usePreview.getState().stop()
    return
  }
  if (id === runId) watchEnd(id)
}

function next() {
  if (index + 1 < queue.length) {
    advancing = true
    void playAt(index + 1, runId)
  } else usePreview.getState().stop()
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
    advancing = false
    cancelAnimationFrame(frame)
    audio?.pause()
    queue = []
    set({ playingKey: null })
  },
}))
