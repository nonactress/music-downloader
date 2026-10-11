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
