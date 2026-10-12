// F28 [나가기] · 쓰는 중 401 (결정 59 · 60)
import { expect, test, type Page } from './fixtures'
import {
  UNAUTHORIZED, USER, appendSecond, extractRunning, json, openEditHome, routeAudio, submitUrl,
} from './fixtures'

const SESSION_KEY = 'easy-music:session'
const card = (page: Page, n: number) => page.getByRole('article', { name: `${n}번 노래` })
const editHeading = (page: Page) => page.getByRole('heading', { name: '노래를 다듬어 주세요' })
const importHeading = (page: Page) => page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })
const loginHeading = (page: Page) => page.getByRole('heading', { name: '로그인해 주세요' })
const logoutBtn = (page: Page) => page.getByRole('button', { name: '나가기' })
const saved = (page: Page) => page.evaluate((k) => localStorage.getItem(k), SESSION_KEY)

/** 로그인 화면에서 loginId로 로그인 (서버는 그 아이디로 답함) */
async function loginAs(page: Page, loginId: string) {
  await page.route('**/api/auth/login', (r) => json(r, { user: { loginId } }))
  await page.getByLabel('아이디', { exact: true }).fill(loginId)
  await page.getByLabel('비밀번호', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '로그인' }).click()
}

test('[나가기]는 로그인한 뒤 모든 화면 헤더에 60px — ① ② ③ ④', async ({ page }) => {
  await routeAudio(page)
  await page.route('**/api/jobs/j1', (r) => json(r, extractRunning(30, 10)))
  await submitUrl(page)
  await expect(page.getByText('30% 완료')).toBeVisible()
  await expect(logoutBtn(page)).toBeVisible()
  await page.getByRole('button', { name: '취소하고 돌아가기' }).click()
  await expect(importHeading(page)).toBeVisible()
  expect((await logoutBtn(page).boundingBox())!.height).toBe(60)

  await page.unrouteAll()
  await openEditHome(page)
  await expect(logoutBtn(page)).toBeVisible()
  await card(page, 1).getByRole('button', { name: '잘라내기' }).click()
  await expect(logoutBtn(page)).toBeVisible()
  // 헤더 한 줄: [가+ 글자 크게] [도움말] [나가기] 순서
  await expect(page.locator('.header__tools button')).toHaveText(['가+ 글자 크게', '도움말', '나가기'])
})

test('[나가기] → POST /auth/logout + 저장한 편집 내용 지움 → 로그인 화면, 같은 아이디로 들어와도 ①', async ({ page }) => {
  let loggedOut = false
  await page.route('**/api/auth/logout', (r) => { loggedOut = true; return r.fulfill({ status: 204 }) })
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  expect(await saved(page)).not.toBeNull()

  await logoutBtn(page).click()
  await expect(loginHeading(page)).toBeVisible()
  expect(loggedOut).toBe(true)
  expect(await saved(page)).toBeNull()
  // 나간 것은 안내 없이 빈 로그인 화면
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(logoutBtn(page)).toHaveCount(0)

  await loginAs(page, USER.loginId)
  await expect(importHeading(page)).toBeVisible()
  await expect(page.getByLabel('유튜브 주소')).toHaveValue('')

  // 새로고침해도 앞 내용은 없음 (서버 세션도 끝났다고 가정)
  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
  await page.reload()
  await expect(loginHeading(page)).toBeVisible()
})

test('[나가기] — 서버에 닿지 않아도 이 브라우저에서는 나감', async ({ page }) => {
  await page.route('**/api/auth/logout', (r) => r.abort())
  await openEditHome(page)
  await logoutBtn(page).click()
  await expect(loginHeading(page)).toBeVisible()
  expect(await saved(page)).toBeNull()
})

test('쓰는 중 401 → 로그인 화면(UNAUTHORIZED 안내), 같은 아이디로 다시 로그인하면 이어서', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  await page.route('**/api/exports', (r) => json(r, UNAUTHORIZED, 401))
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()

  await expect(loginHeading(page)).toBeVisible()
  await expect(page.getByRole('alert')).toHaveText('로그인이 필요해요. 다시 로그인해 주세요.')
  await expect(page).toHaveTitle('로그인 — 쉬운 음악 만들기')
  // 편집 내용은 남겨 둔다
  expect(JSON.parse((await saved(page))!).edit.tracks).toHaveLength(2)

  await loginAs(page, USER.loginId)
  await expect(editHeading(page)).toBeVisible()
  await expect(card(page, 2)).toContainText('[두 번째 노래 제목]')
  // 되돌리기 기록도 그대로
  await expect(page.getByRole('status')).toHaveText(/2번 노래를 붙였어요/)
})

test('쓰는 중 401 → 다른 아이디로 로그인하면 앞 사람 편집 내용을 지우고 ①', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  await page.route('**/api/exports', (r) => json(r, UNAUTHORIZED, 401))
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(loginHeading(page)).toBeVisible()

  await loginAs(page, 'grandpa')
  await expect(importHeading(page)).toBeVisible()
  await expect(page.getByLabel('유튜브 주소')).toHaveValue('')
  expect(await saved(page)).toBeNull()
})

test('불러오는 중 401 → 로그인 → 같은 작업을 다시 조회해 이어감', async ({ page }) => {
  let expired = true
  await page.route('**/api/jobs/j1', (r) => (expired ? json(r, UNAUTHORIZED, 401) : json(r, extractRunning(70, 5))))
  await submitUrl(page)
  await expect(loginHeading(page)).toBeVisible()
  expired = false
  await loginAs(page, USER.loginId)
  await expect(page.getByText('70% 완료')).toBeVisible()
})

test('새로고침 — 저장한 사람과 같은 아이디면 이어서, 다른 아이디면 지우고 ①', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  expect(JSON.parse((await saved(page))!).loginId).toBe(USER.loginId)

  await page.reload()
  await expect(card(page, 2)).toBeVisible()

  await page.route('**/api/auth/me', (r) => json(r, { user: { loginId: 'grandpa' } }))
  await page.reload()
  await expect(importHeading(page)).toBeVisible()
  expect(await saved(page)).toBeNull()
})

test('새로고침 — 로그인이 끝났으면 로그인 화면, 같은 아이디로 들어오면 이어서', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)

  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
  await page.reload()
  await expect(loginHeading(page)).toBeVisible()
  // 처음 열 때 로그인 화면은 안내 없이
  await expect(page.getByRole('alert')).toHaveCount(0)
  await loginAs(page, USER.loginId)
  await expect(card(page, 2)).toBeVisible()
})

test('6단계 전에 저장한 값(v1, 누구 것인지 모름)은 버리고 ①', async ({ page }) => {
  await openEditHome(page)
  await page.evaluate((k) => {
    const data = JSON.parse(localStorage.getItem(k)!)
    delete data.loginId
    data.v = 1
    localStorage.setItem(k, JSON.stringify(data))
  }, SESSION_KEY)
  await page.reload()
  await expect(importHeading(page)).toBeVisible()
  expect(await saved(page)).toBeNull()
})
