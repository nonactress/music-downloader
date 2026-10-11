// 화면 표기 변환 (CONTRACT 0장: 초 → "3분 45초", "0:12")

/** 225 → "3분 45초", 240 → "4분 0초", 45 → "45초" */
export function formatKoreanDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

/** 12 → "0:12", 200 → "3:20" */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 6082560 → "5.8MB" */
export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}
