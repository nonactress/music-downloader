// 화면 설정 — 글자 크게 (결정 46). 브라우저에 기억해서 다음에 열어도 유지
import { create } from 'zustand'

export const BIG_TEXT_KEY = 'easy-music:big-text'
/** 글자 크게 모드에서 화면 전체 배율 */
export const BIG_TEXT_ZOOM = 1.25

function readBigText(): boolean {
  try {
    return localStorage.getItem(BIG_TEXT_KEY) === '1'
  } catch {
    return false
  }
}

function applyBigText(on: boolean) {
  document.documentElement.style.zoom = on ? String(BIG_TEXT_ZOOM) : ''
  try {
    if (on) localStorage.setItem(BIG_TEXT_KEY, '1')
    else localStorage.removeItem(BIG_TEXT_KEY)
  } catch {
    // 저장이 막혀 있어도 이번 화면에서는 동작
  }
}

interface UiStore {
  bigText: boolean
  toggleBigText: () => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  bigText: readBigText(),
  toggleBigText: () => {
    const on = !get().bigText
    applyBigText(on)
    set({ bigText: on })
  },
}))

/** 앱을 열 때 기억해 둔 설정을 화면에 적용 */
export function initUi() {
  if (useUiStore.getState().bigText) applyBigText(true)
}
