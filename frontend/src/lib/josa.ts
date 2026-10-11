// 「제목」 뒤 조사 을/를 — 마지막 글자가 한글이면 받침으로 고르고, 아니면 "을(를)"
export function eulReul(word: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return '을(를)'
  return code % 28 === 0 ? '를' : '을'
}
