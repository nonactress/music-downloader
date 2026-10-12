// F25 글자 크게 모드 1440px 스크린샷 — 7개 화면 + 저장 대기 (결정 46)
import { expect, test } from './fixtures'
import {
  appendSecond, exportDone, exportRunning, extractRunning, json, openEditHome, routeAudio, shot, submitUrl, track,
} from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('easy-music:big-text', '1'))
  await routeAudio(page)
})

test('글자 크게 ① ②', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '가 글자 원래대로' })).toBeVisible()
  await shot(page, 'big-01-import')

  await page.route('**/api/jobs/j1', (r) => json(r, extractRunning(60, 20)))
  await submitUrl(page)
  await expect(page.getByText('60% 완료')).toBeVisible()
  await shot(page, 'big-02-loading')
})

test('글자 크게 ③ ④ ⑤ ⑥ 저장 대기 ⑦', async ({ page }) => {
  await openEditHome(page, { ...track, title: '[첫 번째 노래 제목]' })
  await appendSecond(page)
  await page.mouse.move(0, 0)
  await shot(page, 'big-03-edit-home')

  await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '잘라내기' }).click()
  await expect(page.locator('.wave[data-ready]')).toBeVisible()
  await shot(page, 'big-04-trim')
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '빠르기', exact: true }).click()
  await shot(page, 'big-05-speed-one')
  await page.getByRole('radio', { name: '모든 노래' }).click()
  await expect(page.getByRole('heading', { name: '모든 노래 빠르기' })).toBeVisible()
  await shot(page, 'big-06-speed-all')
  await page.getByRole('button', { name: '바꾸지 않고 돌아가기' }).click()

  let done = false
  await page.route('**/api/exports', (r) => json(r, { jobId: 'j2', exportId: 'e1' }, 202))
  await page.route('**/api/jobs/j2', (r) => json(r, done ? exportDone() : exportRunning(40, 12)))
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByText('40% 완료')).toBeVisible()
  await shot(page, 'big-saving')
  done = true
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
  await shot(page, 'big-07-done')
})
