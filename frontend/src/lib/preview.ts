// 브라우저 미리듣기 — <audio> 하나로 구간(start~end)을 playbackRate + preservesPitch로 재생.
// 서버 렌더링 없음 (CLAUDE.md). 여러 구간이면 순서대로 이어서 재생한다.
import { create } from 'zustand'
import { checkSession } from '../store/authStore'

export interface Segment {
  src: string
  start: number
  end: number
  speed: number
  keepPitch: boolean
  /** 부드럽게 잇기 흉내: 처음 1초 소리 키우기 (결정 41) */
  fadeIn?: boolean
  /** 부드럽게 잇기 흉내: 끝 1초 소리 줄이기 (결정 41) */
  fadeOut?: boolean
}

/** 페이드 길이 — 결과(빠르기 반영) 기준 1초 */
export const FADE_SEC = 1

/** 구간 안 위치(원곡 초)에서의 소리 크기 0~1 — 겹치지 않고 소리만 줄였다 키운다 */
export function fadeVolume(seg: Segment, currentTime: number): number {
  const fromStart = (currentTime - seg.start) / seg.speed
  const toEnd = (seg.end - currentTime) / seg.speed
  let v = 1
  if (seg.fadeIn) v = Math.min(v, fromStart / FADE_SEC)
  if (seg.fadeOut) v = Math.min(v, toEnd / FADE_SEC)
  return Math.max(0, Math.min(1, v))
}

/** 여러 곡을 이어 들을 때 잇기가 켜져 있으면 곡 사이에만 페이드를 붙인다 */
export function withFades(segments: Segment[], crossfade: boolean): Segment[] {
  if (!crossfade || segments.length < 2) return segments
  return segments.map((s, i) => ({ ...s, fadeIn: i > 0, fadeOut: i < segments.length - 1 }))
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
    audio.addEventListener('error', () => {
      usePreview.getState().stop()
      // 세션이 끝나 오디오가 401로 막혔을 수 있다 → 로그인 화면 (결정 60)
      void checkSession()
    })
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
  if (seg) audio.volume = fadeVolume(seg, audio.currentTime)
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
  a.volume = fadeVolume(seg, seg.start)
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
    if (audio) audio.volume = 1
    queue = []
    set({ playingKey: null })
  },
}))
