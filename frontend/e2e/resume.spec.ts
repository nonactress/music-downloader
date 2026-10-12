// F23 새로고침 · 창을 닫아도 이어서 (결정 48)
import { expect, test, type Page } from './fixtures'
import {
  appendSecond, exportDone, exportRunning, extractDone, extractRunning, json, openEditHome, routeAudio, submitUrl,
} from './fixtures'

const card = (page: Page, n: number) => page.getByRole('article', { name: `${n}번 노래` })
const editHeading = (page: Page) => page.getByRole('heading', { name: '노래를 다듬어 주세요' })

/** 창을 닫았다가 같은 브라우저로 다시 연 것처럼 — 새 탭에서 열기 */
async function reopen(page: Page) {
  const next = await page.context().newPage()
  await page.close()
  return next
}

test('③에서 새로고침 → 노래 · 편집 내용 · 되돌리기 기록 그대로', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  await page.getByRole('checkbox', { name: /노래 사이 부드럽게 잇기/ }).uncheck()
  await expect(page.getByText('전체 길이 7분 45초')).toBeVisible()

  await page.reload()
  await expect(editHeading(page)).toBeVisible()
  await expect(card(page, 2)).toContainText('[두 번째 노래 제목]')
  await expect(page.getByRole('checkbox', { name: /노래 사이 부드럽게 잇기/ })).not.toBeChecked()
  await expect(page.getByText('전체 길이 7분 45초')).toBeVisible()

  // 되돌리기 기록도 이어짐: 잇기 끈 것 → 2번 붙인 것 순서로 되돌아감
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /노래 사이 부드럽게 잇기/ })).toBeChecked()
  await expect(page.getByRole('status')).toHaveText(/2번 노래를 붙였어요/)
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(card(page, 2)).toHaveCount(0)
})

test('창을 닫았다 다시 열어도 ③으로', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  const next = await reopen(page)
  await next.goto('/')
  await expect(editHeading(next)).toBeVisible()
  await expect(card(next, 2)).toBeVisible()
})

test('잘라내기 화면에서 새로고침 → 들어가기 전 상태의 ③ (편집 내용과 되돌리기 기록이 어긋나지 않게)', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await card(page, 1).getByRole('button', { name: '잘라내기' }).click()
  await page.getByRole('group', { name: '시작' }).getByRole('button', { name: '+5초' }).click()
  await expect(page.getByText(/남는 길이 3분 40초/)).toBeVisible()

  await page.reload()
  await expect(editHeading(page)).toBeVisible()
  await expect(card(page, 1).getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toHaveCount(0)

  // 잘라내기를 끝낸 뒤 새로고침하면 그 변경은 남는다
  await card(page, 1).getByRole('button', { name: '잘라내기' }).click()
  await page.getByRole('group', { name: '시작' }).getByRole('button', { name: '+5초' }).click()
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await page.reload()
  await expect(card(page, 1).getByText('3분 40초 (앞 잘라냄) · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/1번 노래를 3분 40초로 잘랐어요/)
})

test('불러오는 중에 새로고침 → 같은 작업을 다시 조회해 이어감', async ({ page }) => {
  let done = false
  const polled: string[] = []
  await page.route('**/api/jobs/*', (r) => {
    polled.push(new URL(r.request().url()).pathname)
    return json(r, done ? extractDone() : extractRunning(40, 30))
  })
  await page.route('**/api/tracks/*/peaks', (r) => json(r, { trackId: 't1', durationSec: 225, pointsPerSecond: 1, peaks: Array(225).fill(0.5) }))
  await submitUrl(page)
  await expect(page.getByText('40% 완료')).toBeVisible()

  let posted = 0
  await page.route('**/api/tracks', (r) => { posted++; return json(r, { jobId: 'j9', trackId: 't9' }, 202) })
  polled.length = 0
  await page.reload()
  await expect(page.getByRole('heading', { name: '노래를 가져오고 있어요' })).toBeVisible()
  await expect(page.getByText('40% 완료')).toBeVisible()
  expect(polled[0]).toBe('/api/jobs/j1')
  expect(posted).toBe(0)

  done = true
  await expect(editHeading(page)).toBeVisible()
  await expect(card(page, 1)).toContainText('[노래 제목]')
})

test('만드는 중에 새로고침 → 같은 내보내기 작업을 조회 → ⑦, ⑦에서 새로고침하면 ③', async ({ page }) => {
  let done = false
  let exports = 0
  await page.route('**/api/exports', (r) => { exports++; return json(r, { jobId: 'j2', exportId: 'e1' }, 202) })
  await page.route('**/api/jobs/j2', (r) => json(r, done ? exportDone(1, 225) : exportRunning(40, 12)))
  await openEditHome(page)
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByText('40% 완료')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '노래를 만들고 있어요' })).toBeVisible()
  await expect(page.getByText('40% 완료')).toBeVisible()
  done = true
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
  expect(exports).toBe(1)

  await page.reload()
  await expect(editHeading(page)).toBeVisible()
})

test('⑦ [새 노래 만들기]를 누르면 지움 → 새로고침해도 ①', async ({ page }) => {
  await page.route('**/api/exports', (r) => json(r, { jobId: 'j2', exportId: 'e1' }, 202))
  await page.route('**/api/jobs/j2', (r) => json(r, exportDone(1, 225)))
  await openEditHome(page)
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await page.getByRole('button', { name: '새 노래 만들기' }).click()
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('easy-music:session'))).toBeNull()
  await page.reload()
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
})

test('23시간이 지났으면 복원하지 않고 ①, 저장해 둔 것도 지움', async ({ page }) => {
  await openEditHome(page)
  await page.evaluate(() => {
    const key = 'easy-music:session'
    const data = JSON.parse(localStorage.getItem(key)!)
    data.startedAt = Date.now() - 23 * 60 * 60 * 1000 - 1000
    // 저장이 다시 덮어쓰지 않게 바로 새로고침 전에 넣는다
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('easy-music:session'))).toBeNull()
})

test('22시간 59분이면 복원', async ({ page }) => {
  await openEditHome(page)
  await page.evaluate(() => {
    const key = 'easy-music:session'
    const data = JSON.parse(localStorage.getItem(key)!)
    data.startedAt = Date.now() - 23 * 60 * 60 * 1000 + 60 * 1000
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload()
  await expect(editHeading(page)).toBeVisible()
})

test('저장한 값이 깨져 있으면 ①부터', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('easy-music:session', '{망가진'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
})
