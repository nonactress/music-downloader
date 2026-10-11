// /api를 CONTRACT 형식 응답으로 가로채는 도우미
import type { Page, Route } from '@playwright/test'

export const SHOTS = 'e2e/screenshots'
export const URL_OK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

// 와이어프레임 자리표시 문구와 같은 값으로 채워 비교하기 쉽게 한다
export const track = {
  trackId: 't1',
  title: '[노래 제목]',
  channel: '[채널 이름]',
  durationSec: 225,
  thumbnailUrl: '',
}

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })

export const extractRunning = (progress: number, etaSeconds: number | null, t = track) => ({
  jobId: 'j1', kind: 'extract', status: 'running', progress, etaSeconds, track: t, result: null, error: null,
})
export const extractDone = (t = track) => ({
  jobId: 'j1', kind: 'extract', status: 'done', progress: 100, etaSeconds: 0, track: t, result: { track: t }, error: null,
})
export const exportRunning = (progress: number, etaSeconds: number | null) => ({
  jobId: 'j2', kind: 'export', status: 'running', progress, etaSeconds, track: null, result: null, error: null,
})
export const exportDone = (trackCount = 2, durationSec = 380) => ({
  jobId: 'j2', kind: 'export', status: 'done', progress: 100, etaSeconds: 0, track: null,
  result: { exportId: 'e1', fileName: '내 노래_1011.mp3', trackCount, durationSec, sizeBytes: 6082560 },
  error: null,
})

export async function submitUrl(page: Page) {
  await page.route('**/api/tracks', (r) => json(r, { jobId: 'j1', trackId: 't1' }, 202))
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill(URL_OK)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
}

/** ①에서 주소를 넣고 추출이 끝나 ③ 편집 홈까지 */
export async function openEditHome(page: Page, t = track) {
  await page.route('**/api/jobs/j1', (r) => json(r, extractDone(t)))
  await page.route('**/api/tracks/*/peaks', (r) =>
    json(r, {
      trackId: t.trackId,
      durationSec: t.durationSec,
      pointsPerSecond: 20,
      peaks: Array.from({ length: Math.ceil(t.durationSec * 20) }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i / 7))),
    }))
  await submitUrl(page)
  await page.getByRole('heading', { name: '노래를 다듬어 주세요' }).waitFor()
}

export async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}
