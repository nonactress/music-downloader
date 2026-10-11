// 1단계 화면 ① ② ⑦ — /api를 CONTRACT 형식 응답으로 가로채서 확인하고 1440px 스크린샷을 남긴다.
import { expect, test, type Page, type Route } from '@playwright/test'

const SHOTS = 'e2e/screenshots'
const URL_OK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

// 와이어프레임 자리표시 문구와 같은 값으로 채워 비교하기 쉽게 한다
const track = {
  trackId: 't1',
  title: '[노래 제목]',
  channel: '[채널 이름]',
  durationSec: 225,
  thumbnailUrl: '',
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })

const extractRunning = (progress: number, etaSeconds: number | null) => ({
  jobId: 'j1', kind: 'extract', status: 'running', progress, etaSeconds, track, result: null, error: null,
})
const extractDone = {
  jobId: 'j1', kind: 'extract', status: 'done', progress: 100, etaSeconds: 0, track, result: { track }, error: null,
}
const exportDone = {
  jobId: 'j2', kind: 'export', status: 'done', progress: 100, etaSeconds: 0, track: null,
  result: { exportId: 'e1', fileName: '내 노래_1011.mp3', trackCount: 2, durationSec: 380, sizeBytes: 6082560 },
  error: null,
}

async function submitUrl(page: Page) {
  await page.route('**/api/tracks', (r) => json(r, { jobId: 'j1', trackId: 't1' }, 202))
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill(URL_OK)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
}

test('① 노래 가져오기', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${SHOTS}/01-import.png`, fullPage: true })
})

test('① 유튜브가 아닌 주소는 서버에 보내지 않고 안내', async ({ page }) => {
  let called = false
  await page.route('**/api/tracks', (r) => { called = true; return json(r, {}) })
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill('https://example.com/video')
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByRole('alert')).toHaveText('유튜브 주소가 아니에요. 주소를 다시 확인해 주세요.')
  expect(called).toBe(false)
})

test('① 서버 4xx는 error.message를 그대로', async ({ page }) => {
  await page.route('**/api/tracks', (r) =>
    json(r, { error: { code: 'RATE_LIMITED', message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' } }, 429))
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill(URL_OK)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByRole('alert')).toHaveText('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.')
})

test('② 불러오는 중', async ({ page }) => {
  // 추출 75% = 화면 60% (추출이 막대의 80%)
  await page.route('**/api/jobs/j1', (r) => json(r, extractRunning(75, 20)))
  await submitUrl(page)
  await expect(page.getByText('60% 완료')).toBeVisible()
  await expect(page.getByText('약 20초 남았어요')).toBeVisible()
  await expect(page.getByText('[채널 이름] · 3분 45초')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${SHOTS}/02-loading.png`, fullPage: true })

  await page.getByRole('button', { name: '취소하고 돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
})

test('② etaSeconds가 null이면 남은 시간 숨김', async ({ page }) => {
  await page.route('**/api/jobs/j1', (r) => json(r, extractRunning(10, null)))
  await submitUrl(page)
  await expect(page.getByText('8% 완료')).toBeVisible()
  await expect(page.getByText(/남았어요/)).toHaveCount(0)
})

test('② 작업 failed는 error.message + 다시 해보기', async ({ page }) => {
  await page.route('**/api/jobs/j1', (r) =>
    json(r, {
      jobId: 'j1', kind: 'extract', status: 'failed', progress: 35, etaSeconds: null, track: null, result: null,
      error: { code: 'TOO_LONG', message: '20분이 넘는 영상은 가져올 수 없어요.' },
    }))
  await submitUrl(page)
  await expect(page.getByRole('alert')).toHaveText('20분이 넘는 영상은 가져올 수 없어요.')
  await page.getByRole('button', { name: '다시 해보기' }).click()
  await expect(page.getByLabel('유튜브 주소')).toHaveValue(URL_OK)
})

test('② → ⑦ 추출 done이면 기본 Edit JSON으로 내보내기', async ({ page }) => {
  let posted: unknown = null
  await page.route('**/api/jobs/j1', (r) => json(r, extractDone))
  await page.route('**/api/exports', (r) => {
    posted = r.request().postDataJSON()
    return json(r, { jobId: 'j2', exportId: 'e1' }, 202)
  })
  await page.route('**/api/jobs/j2', (r) => json(r, exportDone))
  await submitUrl(page)

  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
  expect(posted).toEqual({
    tracks: [{ sourceId: 't1', start: 0, end: 225, speed: 1.0, keepPitch: true }],
    crossfade: 2,
    normalize: true,
    format: 'mp3',
  })
  await expect(page.getByText('노래 2곡 · 6분 20초 · 5.8MB')).toBeVisible()
  await expect(page.getByRole('link', { name: '내 컴퓨터에 저장하기' })).toHaveAttribute('href', '/api/exports/e1/download')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${SHOTS}/07-done.png`, fullPage: true })
})
