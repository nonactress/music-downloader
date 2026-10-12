// 화면 ① ② ⑦ + 저장 대기 — 흐름 · 에러 확인과 1440px 스크린샷
import { expect, test } from './fixtures'
import {
  URL_OK, exportDone, exportRunning, extractRunning, json, openEditHome, shot, submitUrl,
} from './fixtures'

test('① 노래 가져오기', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await shot(page, '01-import')
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

test('② 불러오는 중 — 추출만 0→100 (결정 21)', async ({ page }) => {
  await page.route('**/api/jobs/j1', (r) => json(r, extractRunning(60, 20)))
  await submitUrl(page)
  await expect(page.getByText('60% 완료')).toBeVisible()
  await expect(page.getByText('약 20초 남았어요')).toBeVisible()
  await expect(page.getByText('[채널 이름] · 3분 45초')).toBeVisible()
  await shot(page, '02-loading')

  await page.getByRole('button', { name: '취소하고 돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
})

test('② etaSeconds가 null이면 남은 시간 숨김', async ({ page }) => {
  await page.route('**/api/jobs/j1', (r) => json(r, extractRunning(10, null)))
  await submitUrl(page)
  await expect(page.getByText('10% 완료')).toBeVisible()
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

test('③ → 저장 대기 → ⑦ → [다시 고치러 가기] → ③', async ({ page }) => {
  let posted: unknown = null
  let exportDoneNow = false
  await page.route('**/api/exports', (r) => {
    posted = r.request().postDataJSON()
    return json(r, { jobId: 'j2', exportId: 'e1' }, 202)
  })
  await page.route('**/api/jobs/j2', (r) => json(r, exportDoneNow ? exportDone() : exportRunning(40, 12)))
  await openEditHome(page)

  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 만들고 있어요' })).toBeVisible()
  await expect(page.getByText('40% 완료')).toBeVisible()
  await expect(page.getByText('자동으로 저장 화면')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '저장하기' })).toHaveAttribute('aria-current', 'step')
  expect(posted).toEqual({
    tracks: [{ sourceId: 't1', start: 0, end: 225, speed: 1.0, keepPitch: true }],
    crossfade: 2,
    normalize: true,
    format: 'mp3',
  })
  await shot(page, 'saving')

  exportDoneNow = true
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
  await expect(page.getByText('노래 2곡 · 6분 20초 · 5.8MB')).toBeVisible()
  await expect(page.getByRole('link', { name: '내 컴퓨터에 저장하기' })).toHaveAttribute('href', '/api/exports/e1/download')
  await shot(page, '07-done')

  await page.getByRole('button', { name: '다시 고치러 가기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible()
})

test('저장 대기 [취소하고 돌아가기] → ③, 실패는 [다시 해보기] → ③', async ({ page }) => {
  let fail = false
  await page.route('**/api/exports', (r) => json(r, { jobId: 'j2', exportId: 'e1' }, 202))
  await page.route('**/api/jobs/j2', (r) =>
    json(r, fail
      ? { ...exportRunning(30, null), status: 'failed', error: { code: 'EXPORT_FAILED', message: '노래를 만들지 못했어요. 잠시 후 다시 시도해 주세요.' } }
      : exportRunning(10, null)))
  await openEditHome(page)

  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await page.getByRole('button', { name: '취소하고 돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible()

  fail = true
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('alert')).toHaveText('노래를 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
  await page.getByRole('button', { name: '다시 해보기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible()
})

test('③ POST /exports 4xx는 편집 홈에 message 그대로', async ({ page }) => {
  await page.route('**/api/exports', (r) =>
    json(r, { error: { code: 'NOT_FOUND', message: '노래를 찾을 수 없어요. 처음부터 다시 해주세요.' } }, 404))
  await openEditHome(page)
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('alert')).toHaveText('노래를 찾을 수 없어요. 처음부터 다시 해주세요.')
  // Edit JSON이 바뀌면 서버 안내도 지운다
  await page.getByRole('checkbox', { name: /소리 크기 고르게 맞추기/ }).uncheck()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
