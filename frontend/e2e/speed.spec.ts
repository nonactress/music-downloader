// ⑤ 한 곡 빠르기 — docs/wireframes/html/Speed.html
import { expect, test, type Page } from './fixtures'
import { openEditHome, routeAudio, shot } from './fixtures'

const card = (page: Page) => page.getByRole('article', { name: '1번 노래' })
const preset = (page: Page, name: string) => page.getByRole('group', { name: '빠르기 고르기' }).getByRole('button', { name: new RegExp(name) })
const fine = (page: Page) => page.getByRole('group', { name: '조금씩 바꾸기' })

async function openSpeed(page: Page) {
  await card(page).getByRole('button', { name: '빠르기' }).click()
  await expect(page.getByRole('heading', { name: '1번 노래 빠르기' })).toBeVisible()
}

test('⑤ 처음 모습 — 보통 선택, 이 노래만, 높낮이 체크, 원래 빠르기면 되돌리기 비활성', async ({ page }) => {
  await openEditHome(page)
  await openSpeed(page)
  await expect(page.getByText('[노래 제목] · 3분 45초')).toBeVisible()
  await expect(page.getByRole('radio', { name: '이 노래만' })).toHaveAttribute('aria-checked', 'true')
  await expect(preset(page, '보통')).toHaveAttribute('aria-pressed', 'true')
  await expect(preset(page, '빠르게')).toHaveAttribute('aria-pressed', 'false')
  await expect(fine(page)).toContainText('1.0배')
  // 결정 33: 기호만 있는 버튼 금지
  await expect(fine(page).getByRole('button', { name: '조금 느리게' })).toHaveText('−느리게')
  await expect(fine(page).getByRole('button', { name: '조금 빠르게' })).toHaveText('+빠르게')
  await expect(page.getByLabel('목소리 높낮이는 그대로 두기 (추천)')).toBeChecked()
  await expect(page.getByText('바뀐 길이 3분 45초')).toBeVisible()
  await expect(page.getByRole('button', { name: '원래 빠르기로 되돌리기' })).toBeDisabled()
})

test('⑤ 빠르게 → 즉시 반영 → ③ 알림 · 카드(결정 27) → 되돌리기 1번(결정 28)', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await openSpeed(page)
  await preset(page, '빠르게').click()
  await expect(preset(page, '빠르게')).toHaveAttribute('aria-pressed', 'true')
  await expect(fine(page)).toContainText('1.25배')
  await expect(page.getByText('바뀐 길이 3분 0초')).toBeVisible()
  await page.getByLabel('목소리 높낮이는 그대로 두기 (추천)').uncheck()
  await page.getByLabel('목소리 높낮이는 그대로 두기 (추천)').check()

  await page.getByRole('button', { name: '들어보기' }).click()
  await expect(page.getByRole('button', { name: '멈추기' })).toBeVisible()
  await page.getByRole('button', { name: '멈추기' }).click()
  await shot(page, '05-speed-one')

  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveText(/1번 노래 빠르기를 빠르게\(1.25배\)로 바꿨어요/)
  await expect(page.getByRole('status').locator('b')).toHaveText('빠르게(1.25배)')
  await expect(card(page).getByText('3분 0초 · 빠르게 1.25배')).toBeVisible()
  await expect(card(page).locator('b')).toHaveText('빠르게 1.25배')
  await expect(card(page).getByText('방금 바뀜')).toBeVisible()
  await expect(page.getByText('전체 길이 3분 0초')).toBeVisible()

  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page).getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('⑤ 조금씩 바꾸기 0.05 단위 · 끝에서 비활성 · 프리셋은 정확히 같을 때만 (결정 26)', async ({ page }) => {
  await openEditHome(page)
  await openSpeed(page)
  const faster = fine(page).getByRole('button', { name: '조금 빠르게' })
  const slower = fine(page).getByRole('button', { name: '조금 느리게' })
  await faster.click()
  await expect(fine(page)).toContainText('1.05배')
  await faster.click()
  await expect(fine(page)).toContainText('1.1배')
  for (const name of ['느리게', '보통', '빠르게']) await expect(preset(page, name)).toHaveAttribute('aria-pressed', 'false')
  while (await faster.isEnabled()) await faster.click()
  await expect(fine(page)).toContainText('2.0배')
  await preset(page, '느리게').click()
  while (await slower.isEnabled()) await slower.click()
  await expect(fine(page)).toContainText('0.5배')
  await expect(page.getByText('바뀐 길이 7분 30초')).toBeVisible()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveText(/1번 노래 빠르기를 느리게\(0.5배\)로 바꿨어요/)
  await expect(card(page).getByText('7분 30초 · 느리게 0.5배')).toBeVisible()
})

test('⑤ [원래 빠르기로 되돌리기] → 1배 + 높낮이 유지, 원래대로면 기록 없음', async ({ page }) => {
  await openEditHome(page)
  await openSpeed(page)
  await preset(page, '느리게').click()
  await page.getByLabel('목소리 높낮이는 그대로 두기 (추천)').uncheck()
  await page.getByRole('button', { name: '원래 빠르기로 되돌리기' }).click()
  await expect(preset(page, '보통')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('목소리 높낮이는 그대로 두기 (추천)')).toBeChecked()
  await expect(page.getByRole('button', { name: '원래 빠르기로 되돌리기' })).toBeDisabled()
  await page.getByRole('button', { name: '노래 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('⑤ 높낮이만 바꾸면 그 내용으로 알림', async ({ page }) => {
  await openEditHome(page)
  await openSpeed(page)
  await page.getByLabel('목소리 높낮이는 그대로 두기 (추천)').uncheck()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveText(/1번 노래 목소리 높낮이를 빠르기에 따라 바뀌게 바꿨어요/)
})
