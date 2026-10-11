// ⑥ 모든 노래 빠르기 — docs/wireframes/html/SpeedAll.html
import { expect, test, type Page } from '@playwright/test'
import { openEditHome, routeAudio, shot } from './fixtures'

const card = (page: Page) => page.getByRole('article', { name: '1번 노래' })
const preset = (page: Page, name: string) => page.getByRole('group', { name: '빠르기 고르기' }).getByRole('button', { name: new RegExp(name) })
const pitch = (page: Page) => page.getByLabel('목소리 높낮이는 그대로 두기 (추천)')

async function openFromHome(page: Page) {
  await page.getByRole('button', { name: /모든 노래 빠르기 바꾸기/ }).click()
  await expect(page.getByRole('heading', { name: '모든 노래 빠르기' })).toBeVisible()
}

/** ⑤에서 1번 노래를 빠르게(1.25배)로 바꾸고 [모든 노래]로 ⑥ */
async function openFromSpeed(page: Page) {
  await card(page).getByRole('button', { name: '빠르기' }).click()
  await preset(page, '빠르게').click()
  await page.getByRole('radio', { name: '모든 노래' }).click()
  await expect(page.getByRole('heading', { name: '모든 노래 빠르기' })).toBeVisible()
}

test('⑥ 편집 홈에서 — 고를 노래 없음(결정 31), 처음은 보통 + 높낮이 유지, 경고 없음', async ({ page }) => {
  await openEditHome(page)
  await openFromHome(page)
  await expect(page.getByText('목록에 있는 노래 1곡이 모두 같은 빠르기로 바뀌어요')).toBeVisible()
  await expect(page.getByText('어디에 적용할까요?')).toHaveCount(0)
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(preset(page, '보통')).toHaveAttribute('aria-pressed', 'true')
  await expect(pitch(page)).toBeChecked()
  await expect(page.getByText('전체 길이 3분 45초')).toBeVisible()
})

test('⑥ ⑤에서 [모든 노래] → 경고 줄(결정 30) · 초안 · 적용 = 되돌리기 1번 · 모든 카드 방금 바뀜(결정 29)', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await openFromSpeed(page)
  await expect(page.getByRole('radio', { name: '모든 노래 (1곡)' })).toHaveAttribute('aria-checked', 'true')
  const note = page.getByRole('note')
  await expect(note).toContainText('따로 바꾼 빠르기가 있어요')
  await expect(note).toContainText('1번 노래는 지금 빠르게(1.25배)예요.')
  await expect(note.locator('b')).toHaveText('빠르게(1.25배)')
  await expect(note).toContainText('여기서 정하면 이 값 대신 새 빠르기로 바뀌어요.')

  // 초안: 화면 값은 바뀌어도 Edit JSON은 그대로
  await expect(page.getByText('전체 길이 3분 45초')).toBeVisible()
  await preset(page, '느리게').click()
  await expect(page.getByText('전체 길이 5분 0초')).toBeVisible()
  await page.getByRole('button', { name: '전체 들어보기' }).click()
  await expect(page.getByRole('button', { name: '멈추기' })).toBeVisible()
  await page.getByRole('button', { name: '멈추기' }).click()
  await preset(page, '보통').click()
  await shot(page, '06-speed-all')

  await preset(page, '느리게').click()
  await pitch(page).uncheck()
  await page.getByRole('button', { name: '모든 노래에 적용하기' }).click()
  await expect(page.getByRole('status')).toHaveText(/모든 노래 빠르기를 느리게\(0.75배\)로 바꿨어요/)
  await expect(card(page).getByText('5분 0초 · 느리게 0.75배')).toBeVisible()
  await expect(card(page).getByText('방금 바뀜')).toBeVisible()

  // 되돌리기 1번 → ⑤에서 바꾼 1.25배로
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page).getByText('3분 0초 · 빠르게 1.25배')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/1번 노래 빠르기를 빠르게\(1.25배\)로 바꿨어요/)
})

test('⑥ [바꾸지 않고 돌아가기] · [노래 목록으로]는 초안 버림', async ({ page }) => {
  await openEditHome(page)
  await openFromHome(page)
  await preset(page, '빠르게').click()
  await page.getByRole('button', { name: '바꾸지 않고 돌아가기' }).click()
  await expect(card(page).getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)

  await openFromHome(page)
  await expect(preset(page, '보통')).toHaveAttribute('aria-pressed', 'true')
  await preset(page, '빠르게').click()
  await page.getByRole('button', { name: '노래 목록으로' }).click()
  await expect(card(page).getByText('3분 45초 · 보통 빠르기')).toBeVisible()
})

test('⑥ [이 노래만] → 원래 그 노래의 ⑤ (결정 31)', async ({ page }) => {
  await openEditHome(page)
  await openFromSpeed(page)
  await page.getByRole('radio', { name: '이 노래만' }).click()
  await expect(page.getByRole('heading', { name: '1번 노래 빠르기' })).toBeVisible()
  await expect(preset(page, '빠르게')).toHaveAttribute('aria-pressed', 'true')
})

test('⑥ 이미 같은 값이면 적용해도 기록 없음', async ({ page }) => {
  await openEditHome(page)
  await openFromHome(page)
  await page.getByRole('button', { name: '모든 노래에 적용하기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
})
