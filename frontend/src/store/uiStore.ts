// 화면 설정 — 글자 크게 (결정 46, 브라우저에 기억) · 도움말 창 (결정 47)
import { create } from 'zustand'
import type { HelpKey } from '../lib/help'

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
  /** 열려 있는 도움말 (null이면 닫힘) */
  help: HelpKey | null
  openHelp: (key: HelpKey) => void
  closeHelp: () => void
}

export const useUiStore = create<UiStore>((set, get) => ({
  bigText: readBigText(),
  toggleBigText: () => {
    const on = !get().bigText
    applyBigText(on)
    set({ bigText: on })
  },
  help: null,
  openHelp: (key) => set({ help: key }),
  closeHelp: () => set({ help: null }),
}))

/** 앱을 열 때 기억해 둔 설정을 화면에 적용 */
export function initUi() {
  if (useUiStore.getState().bigText) applyBigText(true)
}
