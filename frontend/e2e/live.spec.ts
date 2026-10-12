// 실제 백엔드 연동 확인용 (LIVE=1일 때만). 유튜브에서 실제로 받아오므로 평소에는 건너뛴다.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.skip(!process.env.LIVE, 'LIVE=1일 때만')

// "Me at the zoo" — 19초짜리 짧은 영상
const VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'

async function importToEditHome(page: Page) {
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill(VIDEO)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByText(/% 완료/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible({ timeout: 120_000 })
}

async function saveAndDownload(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 만들고 있어요' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible({ timeout: 120_000 })
  const href = await page.getByRole('link', { name: '내 컴퓨터에 저장하기' }).getAttribute('href')
  const res = await page.request.get(href!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('audio/mpeg')
  expect(res.headers()['content-disposition']).toContain("filename*=UTF-8''")
  return res.body()
}

/** ffprobe로 받은 mp3의 실제 길이(초) */
function probeDuration(mp3: Buffer): number {
  const file = join(mkdtempSync(join(tmpdir(), 'live-e2e-')), 'out.mp3')
  writeFileSync(file, mp3)
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  return Number(out.toString().trim())
}

test('실제 백엔드: 주소 → 불러오기 → 편집 홈 → 저장 완료 → 다운로드', async ({ page }) => {
  test.setTimeout(240_000)
  await importToEditHome(page)
  await saveAndDownload(page)
  await expect(page.getByText(/노래 1곡 · \d+초 · [\d.]+(MB|KB)/)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/live-done.png', fullPage: true })
})

test('실제 백엔드: 자르기 → 저장 → 다운로드 길이 = 남긴 길이', async ({ page }) => {
  test.setTimeout(240_000)
  await importToEditHome(page)
  await expect(page.locator('.song-card__sub')).toHaveText(/^19초/)

  await page.getByRole('button', { name: '잘라내기' }).click()
  await expect(page.locator('.wave[data-ready]')).toBeVisible()
  await page.getByRole('group', { name: '시작' }).getByRole('button', { name: '+5초' }).click()
  await page.getByRole('group', { name: '끝' }).getByRole('button', { name: '−5초' }).click()
  await page.screenshot({ path: 'e2e/screenshots/live-trim.png', fullPage: true })
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  // 원곡 19.006초 → 5초 ~ 14.006초 = 9.006초
  await expect(page.getByText('9초 (앞뒤 잘라냄) · 보통 빠르기')).toBeVisible()
  const mp3 = await saveAndDownload(page)
  await expect(page.getByText(/노래 1곡 · 9초 · /)).toBeVisible()
  const sec = probeDuration(mp3)
  expect(sec).toBeGreaterThan(9.006 - 0.1)
  expect(sec).toBeLessThan(9.006 + 0.1)
})

test('실제 백엔드: 빠르기 1.25배 → 저장 → 다운로드 길이 = (end−start)/1.25', async ({ page }) => {
  test.setTimeout(240_000)
  await importToEditHome(page)
  await page.getByRole('button', { name: '빠르기', exact: true }).click()
  await page.getByRole('group', { name: '빠르기 고르기' }).getByRole('button', { name: /빠르게/ }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  // 19.006초 / 1.25 = 15.2048초
  await expect(page.getByText('15초 · 빠르게 1.25배')).toBeVisible()
  const mp3 = await saveAndDownload(page)
  await expect(page.getByText(/노래 1곡 · 15초 · /)).toBeVisible()
  const sec = probeDuration(mp3)
  expect(sec).toBeGreaterThan(19.006 / 1.25 - 0.1)
  expect(sec).toBeLessThan(19.006 / 1.25 + 0.1)
})

test('실제 백엔드: [+]로 2.0배 끝까지 올린 Edit JSON → POST /exports 202', async ({ page }) => {
  test.setTimeout(240_000)
  await importToEditHome(page)
  await page.getByRole('button', { name: '빠르기', exact: true }).click()
  const faster = page.getByRole('group', { name: '조금씩 바꾸기' }).getByRole('button', { name: '조금 빠르게' })
  while (await faster.isEnabled()) await faster.click()
  await expect(page.getByRole('group', { name: '조금씩 바꾸기' })).toContainText('2.0배')
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  const posted = page.waitForResponse((r) => r.url().endsWith('/api/exports') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  const res = await posted
  expect(res.status()).toBe(202)
  expect(res.request().postDataJSON().tracks[0].speed).toBe(2)
  await expect(page.getByRole('heading', { name: '노래를 만들고 있어요' })).toBeVisible()
})

/** ③에서 같은 영상을 한 번 더 붙인다 — 서버가 새 trackId를 준다 */
async function appendSameVideo(page: Page) {
  await page.getByLabel('노래 하나 더 붙이기').fill(VIDEO)
  await page.getByRole('button', { name: '불러와서 붙이기' }).click()
  await expect(page.getByRole('article', { name: '2번 노래' })).toBeVisible({ timeout: 120_000 })
}

test('실제 백엔드: 2곡 붙이기 → 순서 바꾸기 → 잇기 · 소리 켬 → 저장 → 다운로드 길이 = CONTRACT 3-4', async ({ page }) => {
  test.setTimeout(300_000)
  await importToEditHome(page)
  await appendSameVideo(page)

  // 2번 노래만 앞 5초를 자르고 1번으로 올림 → 순서가 Edit JSON에 그대로 가는지
  await page.getByRole('article', { name: '2번 노래' }).getByRole('button', { name: '잘라내기' }).click()
  await page.getByRole('group', { name: '시작' }).getByRole('button', { name: '+5초' }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await page.getByRole('article', { name: '2번 노래' }).getByRole('button', { name: '위로' }).click()
  await expect(page.getByRole('article', { name: '1번 노래' }).getByText(/^14초 \(앞 잘라냄\)/)).toBeVisible()

  await expect(page.getByRole('checkbox', { name: /노래 사이 부드럽게 잇기/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /소리 크기 고르게 맞추기/ })).toBeChecked()

  const posted = page.waitForRequest((r) => r.url().endsWith('/api/exports') && r.method() === 'POST')
  const mp3Promise = saveAndDownload(page)
  const body = (await posted).postDataJSON()
  expect(body.tracks).toHaveLength(2)
  expect(body.tracks[0].start).toBe(5)
  expect(body.tracks[1].start).toBe(0)
  expect(body).toMatchObject({ crossfade: 2, normalize: true })
  const mp3 = await mp3Promise
  await expect(page.getByText(/노래 2곡 · 31초 · /)).toBeVisible()

  // (19.006 − 5) + 19.006 − 2 = 31.012초
  const expected = 19.006 - 5 + 19.006 - 2
  const sec = probeDuration(mp3)
  expect(sec).toBeGreaterThan(expected - 0.3)
  expect(sec).toBeLessThan(expected + 0.3)
})

test('실제 백엔드: 1곡 남기고 빼기 → [빼기] 비활성', async ({ page }) => {
  test.setTimeout(240_000)
  await importToEditHome(page)
  await appendSameVideo(page)
  await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '빼기' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '빼기' })).toBeDisabled()
})
