// 실제 백엔드 연동 확인용 (LIVE=1일 때만). 유튜브에서 실제로 받아오므로 평소에는 건너뛴다.
import { expect, test } from '@playwright/test'

test.skip(!process.env.LIVE, 'LIVE=1일 때만')

test('실제 백엔드: 주소 → 불러오기 → 저장 완료 → 다운로드', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill('https://www.youtube.com/watch?v=jNQXAC9IVRw')
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByText(/% 완료/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible({ timeout: 170_000 })
  await expect(page.getByText(/노래 1곡 · \d+초 · [\d.]+(MB|KB)/)).toBeVisible()

  const href = await page.getByRole('link', { name: '내 컴퓨터에 저장하기' }).getAttribute('href')
  const res = await page.request.get(href!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('audio/mpeg')
  expect(res.headers()['content-disposition']).toContain("filename*=UTF-8''")
  await page.screenshot({ path: 'e2e/screenshots/live-done.png', fullPage: true })
})
