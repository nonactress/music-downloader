// F20 — 03-edit-home.png와 같은 장면: 2곡, 1번 앞뒤 잘라냄, 2번 빠르게 1.25배 + 알림
import { expect, test } from '@playwright/test'
import { appendSecond, openEditHome, shot, track } from './fixtures'

test('③ 와이어프레임 장면 (2곡 · 1번 잘라냄 · 2번 1.25배 · 알림)', async ({ page }) => {
  await openEditHome(page, { ...track, title: '[첫 번째 노래 제목]' })
  await appendSecond(page)

  // 1번: 0:10 ~ 3:20
  await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '잘라내기' }).click()
  for (let i = 0; i < 2; i++) await page.getByRole('group', { name: '시작' }).getByRole('button', { name: '+5초' }).click()
  for (let i = 0; i < 5; i++) await page.getByRole('group', { name: '끝' }).getByRole('button', { name: '−5초' }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  // 2번: 빠르게 1.25배
  await page.getByRole('article', { name: '2번 노래' }).getByRole('button', { name: '빠르기', exact: true }).click()
  await page.getByRole('group', { name: '빠르기 고르기' }).getByRole('button', { name: /빠르게/ }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await expect(page.getByRole('status')).toHaveText(/2번 노래 빠르기를 빠르게\(1.25배\)로 바꿨어요/)
  await expect(page.getByText('3분 10초 (앞뒤 잘라냄) · 보통 빠르기')).toBeVisible()
  await expect(page.getByText('3분 12초 · 빠르게 1.25배')).toBeVisible()
  await expect(page.getByRole('article', { name: '2번 노래' }).getByText('방금 바뀜')).toBeVisible()
  // 190 + 192 − 2 = 380초
  await expect(page.getByText('전체 길이 6분 20초')).toBeVisible()
  await page.mouse.move(0, 0)
  await shot(page, '03-edit-home')
})
