import type { ApiErrorBody } from '../api/types'

// CONTRACT 2-1 허용 호스트
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

/** 서버에 보내기 전 검사. 문제가 없으면 null, 있으면 CONTRACT 4장 문구를 돌려준다. */
export function checkYoutubeUrl(raw: string): ApiErrorBody | null {
  let url: URL
  try {
    const text = raw.trim()
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return INVALID_URL
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return INVALID_URL
  if (url.pathname === '/playlist') return PLAYLIST_NOT_ALLOWED
  return null
}

const INVALID_URL: ApiErrorBody = {
  code: 'INVALID_URL',
  message: '유튜브 주소가 아니에요. 주소를 다시 확인해 주세요.',
}

const PLAYLIST_NOT_ALLOWED: ApiErrorBody = {
  code: 'PLAYLIST_NOT_ALLOWED',
  message: '재생목록은 가져올 수 없어요. 노래 영상 하나의 주소를 넣어주세요.',
}
