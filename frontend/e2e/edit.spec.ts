// ③ 편집 홈 (2단계 범위) — docs/wireframes/html/Edit.html
import { expect, test } from '@playwright/test'
import { openEditHome, routeAudio, shot } from './fixtures'

test('③ 노래 카드 · 전체 길이 · 4단계 전체 영역(결정 43)', async ({ page }) => {
  await openEditHome(page)
  const card = page.getByRole('article', { name: '1번 노래' })
  await expect(card.getByText('[노래 제목]')).toBeVisible()
  await expect(card.getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(card.getByRole('button', { name: '잘라내기' })).toBeVisible()
  await expect(card.getByRole('button', { name: '빠르기' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '모든 노래에 한 번에 적용' })).toBeVisible()
  await expect(page.getByRole('button', { name: /모든 노래 빠르기 바꾸기/ })).toBeVisible()
  await expect(page.getByText('전체를 같은 빠르기로')).toBeVisible()
  await expect(page.getByText('전체 길이 3분 45초')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByText('방금 바뀜')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '처음 상태로 되돌리기' })).toBeDisabled()

  await expect(page.getByLabel('노래 하나 더 붙이기')).toBeVisible()
  await expect(page.getByRole('button', { name: '불러와서 붙이기' })).toBeVisible()
  // 1곡이면 [위로] [아래로] [빼기] 모두 비활성 (결정 38)
  for (const name of ['위로', '아래로', '빼기']) {
    await expect(card.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await expect(page.getByRole('checkbox', { name: /노래 사이 부드럽게 잇기/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /소리 크기 고르게 맞추기/ })).toBeChecked()
  await shot(page, '03-edit-home-initial')
})

test('③ [들어보기] · [전체 들어보기]는 브라우저에서 재생하고 [멈추기]로 바뀜', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  const card = page.getByRole('article', { name: '1번 노래' })

  await card.getByRole('button', { name: '들어보기' }).click()
  await expect(card.getByRole('button', { name: '멈추기' })).toBeVisible()
  await card.getByRole('button', { name: '멈추기' }).click()
  await expect(card.getByRole('button', { name: '들어보기' })).toBeVisible()

  await page.getByRole('button', { name: '전체 들어보기' }).click()
  await expect(page.getByRole('button', { name: '멈추기' })).toBeVisible()
  await expect(card.getByRole('button', { name: '들어보기' })).toBeVisible()
})
