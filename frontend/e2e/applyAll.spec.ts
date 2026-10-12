// "모든 노래에 한 번에 적용" — 부드럽게 잇기 · 소리 크기 (결정 39 · 40 · 42)
import { expect, test, type Page } from './fixtures'
import { appendSecond, json, openEditHome } from './fixtures'

const crossfade = (page: Page) => page.getByRole('checkbox', { name: /노래 사이 부드럽게 잇기/ })
const normalize = (page: Page) => page.getByRole('checkbox', { name: /소리 크기 고르게 맞추기/ })
const card = (page: Page, n: number) => page.getByRole('article', { name: `${n}번 노래` })

test('체크는 즉시 반영 + 알림 + 되돌리기, 전체 길이에 겹침 반영 (결정 39 · 41)', async ({ page }) => {
  await openEditHome(page)
  await appendSecond(page)
  await expect(page.getByText('전체 길이 7분 43초')).toBeVisible()

  await crossfade(page).uncheck()
  await expect(page.getByRole('status')).toHaveText(/노래 사이 부드럽게 잇기를 껐어요/)
  await expect(page.getByText('전체 길이 7분 45초')).toBeVisible()
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(crossfade(page)).toBeChecked()
  await expect(page.getByText('전체 길이 7분 43초')).toBeVisible()

  await normalize(page).uncheck()
  await expect(page.getByRole('status')).toHaveText(/소리 크기 고르게 맞추기를 껐어요/)
  await normalize(page).check()
  await expect(page.getByRole('status')).toHaveText(/소리 크기 고르게 맞추기를 켰어요/)
})

test('[처음 상태로 되돌리기]는 목록 · 순서는 그대로, 나머지만 기본값 (결정 42)', async ({ page }) => {
  await openEditHome(page)
  await appendSecond(page)
  await card(page, 2).getByRole('button', { name: '위로' }).click()
  await crossfade(page).uncheck()
  await normalize(page).uncheck()

  await page.getByRole('button', { name: '처음 상태로 되돌리기' }).click()
  await expect(page.getByRole('status')).toHaveText(/모든 노래를 처음 상태로 되돌렸어요/)
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(card(page, 1).getByText('[두 번째 노래 제목]')).toBeVisible()
  await expect(crossfade(page)).toBeChecked()
  await expect(normalize(page)).toBeChecked()
})

test('잇기가 켜져 있고 2초 이하로 남긴 노래가 있으면 저장하지 않고 안내 (결정 40)', async ({ page }) => {
  let posted = 0
  await page.route('**/api/exports', (r) => { posted += 1; return json(r, { jobId: 'j2', exportId: 'e1' }, 202) })
  await page.route('**/api/jobs/j2', (r) =>
    json(r, { jobId: 'j2', kind: 'export', status: 'running', progress: 1, etaSeconds: null, track: null, result: null, error: null }))
  await openEditHome(page)
  await appendSecond(page)

  // 1번 노래를 1초만 남김
  await card(page, 1).getByRole('button', { name: '잘라내기' }).click()
  const up = page.getByRole('group', { name: '시작' }).getByRole('button', { name: '+5초' })
  while (await up.isEnabled()) await up.click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    '1번 노래가 너무 짧아서 부드럽게 이을 수 없어요. 더 길게 남기거나 [노래 사이 부드럽게 잇기]를 꺼 주세요.')
  expect(posted).toBe(0)

  // 원인을 고치면 안내가 바로 사라짐
  await crossfade(page).uncheck()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 만들고 있어요' })).toBeVisible()
  expect(posted).toBe(1)
})
