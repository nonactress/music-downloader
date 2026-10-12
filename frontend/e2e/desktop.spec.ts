// F40 윈도우 프로그램 화면 — CONTRACT 7-2, 결정 70 (서버 모드는 login · logout.spec 그대로)
import { expect, test, type Page } from './fixtures'
import { UNAUTHORIZED, USER, appendSecond, json, openEditHome, routeAudio, shot } from './fixtures'

const RESTART = '프로그램을 껐다가 다시 켜 주세요.'
const SESSION_KEY = 'easy-music:session'
const loginHeading = (page: Page) => page.getByRole('heading', { name: '로그인해 주세요' })
const card = (page: Page, n: number) => page.getByRole('article', { name: `${n}번 노래` })
const saved = (page: Page) => page.evaluate((k) => localStorage.getItem(k), SESSION_KEY)

/** 윈도우 프로그램의 GET /auth/me (CONTRACT 7-2) */
async function desktop(page: Page) {
  await page.route('**/api/auth/me', (r) => json(r, { user: { loginId: 'me' }, desktop: true }))
}

async function expectRestart(page: Page) {
  await expect(page.getByRole('alert')).toHaveText(RESTART)
  await expect(loginHeading(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '나가기' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '진행 단계' })).toHaveCount(0)
  await expect(page).toHaveTitle('쉬운 음악 만들기')
}

test('데스크톱: 로그인 화면 없이 ①, 헤더에 [나가기] 없음 — ① ③', async ({ page }) => {
  await desktop(page)
  await routeAudio(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await expect(page.locator('.header__tools button')).toHaveText(['가+ 글자 크게', '도움말'])
  await openEditHome(page)
  await expect(page.locator('.header__tools button')).toHaveText(['가+ 글자 크게', '도움말'])
})

test('서버 모드(desktop: false)는 지금 그대로 [나가기]', async ({ page }) => {
  await page.route('**/api/auth/me', (r) => json(r, { user: USER, desktop: false }))
  await page.goto('/')
  await expect(page.locator('.header__tools button')).toHaveText(['가+ 글자 크게', '도움말', '나가기'])
})

test('데스크톱: 쓰는 중 401 → 로그인 화면 대신 "프로그램을 껐다가 다시 켜 주세요.", 편집 내용은 남김', async ({ page }) => {
  await desktop(page)
  await routeAudio(page)
  await openEditHome(page)
  await appendSecond(page)
  await page.route('**/api/exports', (r) => json(r, UNAUTHORIZED, 401))
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expectRestart(page)
  // 도움말은 그대로 열림
  await page.getByRole('button', { name: '도움말' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await shot(page, '00-desktop-restart')
  expect(JSON.parse((await saved(page))!).edit.tracks).toHaveLength(2)

  // 프로그램을 다시 켜면(새 세션) 이어서 하기
  await page.unroute('**/api/exports')
  await page.reload()
  await expect(card(page, 2)).toBeVisible()
})

test('데스크톱: 쓰는 중 미리듣기가 막히면(<audio> error → /auth/me 401) 다시 켜 달라는 안내', async ({ page }) => {
  await desktop(page)
  await openEditHome(page)
  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
  await page.route('**/api/tracks/*/audio', (r) => json(r, UNAUTHORIZED, 401))
  await card(page, 1).getByRole('button', { name: '들어보기' }).click()
  await expectRestart(page)
})

test('데스크톱이었던 창을 켰는데 바로 401 → 로그인 화면이 아니라 다시 켜 달라는 안내', async ({ page }) => {
  await desktop(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
  await page.reload()
  await expectRestart(page)
})

test('서버 모드로 다시 쓰면 기억을 지움 — 켜자마자 401이면 로그인 화면', async ({ page }) => {
  await desktop(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await page.route('**/api/auth/me', (r) => json(r, { user: USER, desktop: false }))
  await page.reload()
  await expect(page.getByRole('button', { name: '나가기' })).toBeVisible()
  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
  await page.reload()
  await expect(loginHeading(page)).toBeVisible()
})

test('처음 켜자마자 401인데 /auth/login이 404(데스크톱) → 로그인 대신 다시 켜 달라는 안내', async ({ page }) => {
  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
  await page.route('**/api/auth/login', (r) => json(r, { error: { code: 'NOT_FOUND', message: '찾을 수 없어요.' } }, 404))
  await page.goto('/')
  await page.getByLabel('아이디', { exact: true }).fill('grandma')
  await page.getByLabel('비밀번호', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '로그인' }).click()
  await expectRestart(page)
})
