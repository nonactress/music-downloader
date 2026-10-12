// ④ 한 곡 잘라내기 + ③ 변경 알림 · 되돌리기 — docs/wireframes/html/Trim.html, Edit.html
import { expect, test, type Page } from './fixtures'
import { json, openEditHome, routeAudio, shot } from './fixtures'

const card = (page: Page) => page.getByRole('article', { name: '1번 노래' })
const group = (page: Page, name: '시작' | '끝') => page.getByRole('group', { name })

async function openTrim(page: Page) {
  await card(page).getByRole('button', { name: '잘라내기' }).click()
  await expect(page.getByRole('heading', { name: '1번 노래 잘라내기' })).toBeVisible()
}

/** 시작 +5초 ×2, 끝 −5초 ×5 → 0:10 ~ 3:20 (남는 길이 3분 10초) */
async function trimLikeWireframe(page: Page) {
  for (let i = 0; i < 2; i++) await group(page, '시작').getByRole('button', { name: '+5초' }).click()
  for (let i = 0; i < 5; i++) await group(page, '끝').getByRole('button', { name: '−5초' }).click()
}

test('④ 처음 모습 — 원래 길이, 더 못 가는 쪽 비활성(결정 19), 파형', async ({ page }) => {
  await openEditHome(page)
  await openTrim(page)
  await expect(page.getByText('[노래 제목] · 원래 길이 3분 45초')).toBeVisible()
  await expect(group(page, '시작')).toContainText('0:00')
  await expect(group(page, '끝')).toContainText('3:45')
  await expect(group(page, '시작').getByRole('button', { name: '−5초' })).toBeDisabled()
  await expect(group(page, '끝').getByRole('button', { name: '+5초' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '이 노래 자르기 취소' })).toBeDisabled()
  await expect(page.locator('.wave[data-ready]')).toBeVisible()
})

test('④ 누르는 즉시 반영 → [완료, 목록으로] → ③ 알림 · 카드(결정 18) → [되돌리기] 1번에 전부(결정 22)', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await openTrim(page)
  await trimLikeWireframe(page)
  await expect(group(page, '시작')).toContainText('0:10')
  await expect(group(page, '끝')).toContainText('3:20')
  await expect(page.getByText('남는 길이 3분 10초')).toBeVisible()

  await page.getByRole('button', { name: '남긴 부분 들어보기' }).click()
  await expect(page.getByRole('button', { name: '멈추기' })).toBeVisible()
  await page.getByRole('button', { name: '멈추기' }).click()
  await shot(page, '04-trim')

  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveText(/1번 노래를 3분 10초로 잘랐어요/)
  await expect(page.getByRole('status').locator('b')).toHaveText('3분 10초')
  await expect(card(page).getByText('3분 10초 (앞뒤 잘라냄) · 보통 빠르기')).toBeVisible()
  await expect(card(page).getByText('방금 바뀜')).toBeVisible()
  await expect(card(page)).toHaveClass(/song-card--changed/)
  await expect(page.getByText('전체 길이 3분 10초')).toBeVisible()
  await shot(page, '03-edit-home-after-trim')

  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page).getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByText('방금 바뀜')).toHaveCount(0)
})

test('④ 앞만 · 뒤만 자르면 (앞 잘라냄) · (뒤 잘라냄)', async ({ page }) => {
  await openEditHome(page)
  await openTrim(page)
  await group(page, '시작').getByRole('button', { name: '+5초' }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(card(page).getByText('3분 40초 (앞 잘라냄) · 보통 빠르기')).toBeVisible()

  await openTrim(page)
  await group(page, '시작').getByRole('button', { name: '−5초' }).click()
  await group(page, '끝').getByRole('button', { name: '−5초' }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(card(page).getByText('3분 40초 (뒤 잘라냄) · 보통 빠르기')).toBeVisible()
})

test('④ [이 노래 자르기 취소] → "원래 길이로 되돌렸어요", 되돌리기는 자른 상태로', async ({ page }) => {
  await openEditHome(page)
  await openTrim(page)
  await trimLikeWireframe(page)
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await openTrim(page)
  await page.getByRole('button', { name: '이 노래 자르기 취소' }).click()
  await expect(group(page, '시작')).toContainText('0:00')
  await expect(group(page, '끝')).toContainText('3:45')
  await page.getByRole('button', { name: '노래 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveText(/1번 노래를 원래 길이로 되돌렸어요/)
  await expect(card(page).getByText('3분 45초 · 보통 빠르기')).toBeVisible()

  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page).getByText('3분 10초 (앞뒤 잘라냄) · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/1번 노래를 3분 10초로 잘랐어요/)
})

test('④ 바꾸지 않고 나가면 기록 없음', async ({ page }) => {
  await openEditHome(page)
  await openTrim(page)
  await group(page, '시작').getByRole('button', { name: '+5초' }).click()
  await group(page, '시작').getByRole('button', { name: '−5초' }).click()
  await page.getByRole('button', { name: '노래 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('④ 최소 1초 남김 (결정 19)', async ({ page }) => {
  await openEditHome(page)
  await openTrim(page)
  const up = group(page, '시작').getByRole('button', { name: '+5초' })
  while (await up.isEnabled()) await up.click()
  await expect(group(page, '시작')).toContainText('3:44')
  await expect(group(page, '끝').getByRole('button', { name: '−5초' })).toBeDisabled()
  await expect(page.getByText('남는 길이 1초')).toBeVisible()
})

test('③ [처음 상태로 되돌리기] → 알림 + 되돌리기, 저장하면 자른 값이 Edit JSON에', async ({ page }) => {
  let posted: { tracks: { start: number; end: number }[] } | null = null
  await page.route('**/api/exports', (r) => {
    posted = r.request().postDataJSON()
    return json(r, { jobId: 'j2', exportId: 'e1' }, 202)
  })
  await page.route('**/api/jobs/j2', (r) =>
    json(r, { jobId: 'j2', kind: 'export', status: 'running', progress: 1, etaSeconds: null, track: null, result: null, error: null }))
  await openEditHome(page)
  await openTrim(page)
  await trimLikeWireframe(page)
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await page.getByRole('button', { name: '처음 상태로 되돌리기' }).click()
  await expect(page.getByRole('status')).toHaveText(/모든 노래를 처음 상태로 되돌렸어요/)
  await expect(card(page).getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('button', { name: '처음 상태로 되돌리기' })).toBeDisabled()
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page).getByText('3분 10초 (앞뒤 잘라냄) · 보통 빠르기')).toBeVisible()

  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 만들고 있어요' })).toBeVisible()
  expect(posted!.tracks[0]).toMatchObject({ start: 10, end: 200 })
})

test('미리듣기는 rAF가 멈춰도(다른 탭) 구간 끝에서 멈춘다 — timeupdate', async ({ page }) => {
  // 백그라운드 탭처럼 requestAnimationFrame이 전혀 돌지 않게
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0
  })
  await routeAudio(page)
  await openEditHome(page)
  await openTrim(page)
  const down = group(page, '끝').getByRole('button', { name: '−5초' })
  while (await down.isEnabled()) await down.click()
  await expect(page.getByText('남는 길이 1초')).toBeVisible()

  await page.getByRole('button', { name: '남긴 부분 들어보기' }).click()
  await expect(page.getByRole('button', { name: '멈추기' })).toBeVisible()
  // 원곡은 225초 — 끝(1초)을 못 보면 계속 재생된다
  await expect(page.getByRole('button', { name: '남긴 부분 들어보기' })).toBeVisible({ timeout: 4000 })
})
