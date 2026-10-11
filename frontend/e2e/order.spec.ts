// 카드 [위로] [아래로] [빼기] (결정 38) — docs/wireframes/html/Edit.html
import { expect, test, type Page } from '@playwright/test'
import { appendSecond, openEditHome } from './fixtures'

const card = (page: Page, n: number) => page.getByRole('article', { name: `${n}번 노래` })

test('[위로] → 즉시 반영 · 알림 · 방금 바뀜 · 되돌리기 1번, 끝 버튼 비활성', async ({ page }) => {
  await openEditHome(page)
  await appendSecond(page)
  await expect(card(page, 1).getByRole('button', { name: '위로' })).toBeDisabled()
  await expect(card(page, 1).getByRole('button', { name: '아래로' })).toBeEnabled()
  await expect(card(page, 2).getByRole('button', { name: '위로' })).toBeEnabled()
  await expect(card(page, 2).getByRole('button', { name: '아래로' })).toBeDisabled()

  await card(page, 2).getByRole('button', { name: '위로' }).click()
  await expect(card(page, 1).getByText('[두 번째 노래 제목]')).toBeVisible()
  await expect(card(page, 2).getByText('[노래 제목]')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/「\[두 번째 노래 제목\]」을\(를\) 1번으로 옮겼어요/)
  await expect(card(page, 1).getByText('방금 바뀜')).toBeVisible()
  await expect(card(page, 2).getByText('방금 바뀜')).toHaveCount(0)

  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page, 1).getByText('[노래 제목]')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/2번 노래를 붙였어요/)

  await card(page, 1).getByRole('button', { name: '아래로' }).click()
  await expect(card(page, 2).getByText('[노래 제목]')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/「\[노래 제목\]」을\(를\) 2번으로 옮겼어요/)
})

test('[빼기] → 확인 창 없이 빠짐 · 알림 · 1곡이면 비활성 · 되돌리기로 복구', async ({ page }) => {
  await openEditHome(page)
  await appendSecond(page)
  await card(page, 1).getByRole('button', { name: '빼기' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(card(page, 1).getByText('[두 번째 노래 제목]')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/「\[노래 제목\]」을\(를\) 뺐어요/)
  await expect(page.getByText('방금 바뀜')).toHaveCount(0)
  await expect(card(page, 1).getByRole('button', { name: '빼기' })).toBeDisabled()
  await expect(page.getByText('전체 길이 4분 0초')).toBeVisible()

  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(card(page, 1).getByText('[노래 제목]')).toBeVisible()
})
