// 윈도우 프로그램(데스크톱 모드) 실제 서버 확인 — F40 · F41 (CONTRACT 7장). 유튜브에서 실제로 받아오므로 평소에는 건너뛴다.
// backend가 띄운 서버로: LIVE_DESKTOP_KEY=<열쇠> PW_BASE_URL=http://127.0.0.1:47821 npx playwright test liveDesktop
import { expect, test, type Page } from '@playwright/test'

const KEY = process.env.LIVE_DESKTOP_KEY
test.skip(!KEY, 'LIVE_DESKTOP_KEY가 있을 때만')

// "Me at the zoo" — 19초짜리 짧은 영상 (live.spec과 같음)
const VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
const RESTART = '프로그램을 껐다가 다시 켜 주세요.'
const saveBtn = (page: Page) => page.getByRole('button', { name: '내 컴퓨터에 저장하기' })

/** 창이 처음 열리는 주소 → 302 / + em_session (CONTRACT 7-1) */
async function start(page: Page) {
  const res = await page.goto(`/desktop/start?key=${encodeURIComponent(KEY!)}`)
  expect(new URL(page.url()).pathname).toBe('/')
  expect(res!.status()).toBe(200)
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
}

async function toDone(page: Page) {
  await page.getByLabel('유튜브 주소').fill(VIDEO)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible({ timeout: 120_000 })
}

test('틀린 열쇠는 403', async ({ request }) => {
  const res = await request.get('/desktop/start?key=wrong', { maxRedirects: 0 })
  expect(res.status()).toBe(403)
})

test('F40: 로그인 화면 없이 ①, [나가기] 없음, /auth/me desktop: true', async ({ page }) => {
  await start(page)
  await expect(page.locator('.header__tools button')).toHaveText(['가+ 글자 크게', '도움말'])
  const me = await page.request.get('/api/auth/me')
  expect(await me.json()).toEqual({ user: { loginId: 'me' }, desktop: true })
  // 윈도우 프로그램은 /auth/login이 없다
  expect((await page.request.post('/api/auth/login', { data: { loginId: 'a', password: 'b' } })).status()).toBe(404)
})

test('F41: 실제 추출 → 렌더 → 다운로드 폴더 저장 · 다시 누르면 (2) · 저장한 곳 열기 204', async ({ page }) => {
  test.setTimeout(300_000)
  await start(page)
  await toDone(page)
  await expect(page.getByRole('link', { name: '내 컴퓨터에 저장하기' })).toHaveCount(0)

  const first = page.waitForResponse((r) => /\/api\/exports\/[^/]+\/save$/.test(r.url()))
  await saveBtn(page).click()
  const body1 = await (await first).json()
  expect(body1.fileName).toMatch(/^내 노래_\d{4}( \(\d+\))?\.mp3$/)
  await expect(page.getByRole('status')).toHaveText(`다운로드 폴더에 「${body1.fileName}」로 저장했어요.`)

  const second = page.waitForResponse((r) => /\/save$/.test(r.url()))
  await saveBtn(page).click()
  const body2 = await (await second).json()
  expect(body2.fileName).not.toBe(body1.fileName)
  expect(body2.fileName).toMatch(/ \(\d+\)\.mp3$/)
  await expect(page.getByRole('status')).toHaveText(`다운로드 폴더에 「${body2.fileName}」로 저장했어요.`)
  await page.screenshot({ path: 'e2e/screenshots/live-desktop-done.png', fullPage: true })

  const reveal = page.waitForResponse((r) => r.url().includes('/api/desktop/reveal/'))
  await page.getByRole('button', { name: '저장한 곳 열기' }).click()
  expect((await reveal).status()).toBe(204)
  await expect(page.getByRole('button', { name: '저장한 곳 열기' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  // 이번 실행에 없는 기록은 404 → 프론트는 버튼만 숨김 (화면 처리는 desktop.spec)
  expect((await page.request.post('/api/desktop/reveal/zzzzzz')).status()).toBe(404)
})

test('F40: 세션이 없어지면(쿠키 지움 = 예전 쿠키) 쓰는 중 · 켜자마자 모두 "다시 켜 주세요"', async ({ page, context }) => {
  await start(page)
  await context.clearCookies()
  // 쓰는 중: POST /tracks 401
  await page.getByLabel('유튜브 주소').fill(VIDEO)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByRole('alert')).toHaveText(RESTART)
  await expect(page.getByRole('heading', { name: '로그인해 주세요' })).toHaveCount(0)
  // 켜자마자: /auth/me 401
  await page.reload()
  await expect(page.getByRole('alert')).toHaveText(RESTART)
  await expect(page.getByRole('heading', { name: '로그인해 주세요' })).toHaveCount(0)
})
