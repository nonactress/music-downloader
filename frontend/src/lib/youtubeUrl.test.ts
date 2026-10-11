import { describe, expect, it } from 'vitest'
import { checkYoutubeUrl } from './youtubeUrl'

describe('checkYoutubeUrl', () => {
  it('유튜브 영상 주소는 통과', () => {
    expect(checkYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(checkYoutubeUrl('youtu.be/dQw4w9WgXcQ')).toBeNull()
    expect(checkYoutubeUrl(' https://music.youtube.com/watch?v=abc ')).toBeNull()
    expect(checkYoutubeUrl('https://www.youtube.com/watch?v=abc&list=PL1')).toBeNull()
  })
  it('다른 주소는 INVALID_URL', () => {
    expect(checkYoutubeUrl('')?.code).toBe('INVALID_URL')
    expect(checkYoutubeUrl('https://evil.com/youtube.com')?.code).toBe('INVALID_URL')
    expect(checkYoutubeUrl('https://youtube.com.evil.com/watch?v=a')?.code).toBe('INVALID_URL')
  })
  it('재생목록은 PLAYLIST_NOT_ALLOWED', () => {
    expect(checkYoutubeUrl('https://www.youtube.com/playlist?list=PL1')?.code).toBe('PLAYLIST_NOT_ALLOWED')
  })
})
