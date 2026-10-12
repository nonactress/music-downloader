// F40 윈도우 프로그램 화면 — CONTRACT 7-2, 결정 70 (서버 모드는 login · logout.spec 그대로)
import { expect, test, type Page } from './fixtures'
import { UNAUTHORIZED, USER, appendSecond, exportDone, json, openEditHome, routeAudio, shot } from './fixtures'

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

// F41 ⑦ 저장 — CONTRACT 7-3 · 7-4, 결정 71
const SAVE_FAILED = { error: { code: 'SAVE_FAILED', message: '컴퓨터에 저장하지 못했어요. 다시 눌러 주세요.' } }
const saveBtn = (page: Page) => page.getByRole('button', { name: '내 컴퓨터에 저장하기' })
const revealBtn = (page: Page) => page.getByRole('button', { name: '저장한 곳 열기' })

/** 데스크톱으로 ③ → 저장 → ⑦ */
async function openDesktopDone(page: Page) {
  await desktop(page)
  await page.route('**/api/exports', (r) => json(r, { jobId: 'j2', exportId: 'e1' }, 202))
  await page.route('**/api/jobs/j2', (r) => json(r, exportDone(1, 225)))
  await openEditHome(page)
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
}

test('데스크톱 ⑦ [내 컴퓨터에 저장하기] → POST /exports/e1/save → 안내 + [저장한 곳 열기] → POST /desktop/reveal', async ({ page }) => {
  const posted: string[] = []
  await page.route('**/api/exports/e1/save', (r) => {
    posted.push(r.request().method())
    return json(r, { fileName: '내 노래_1011.mp3', savedId: 's1' })
  })
  let revealed = ''
  await page.route('**/api/desktop/reveal/*', (r) => { revealed = r.request().url(); return r.fulfill({ status: 204 }) })
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await openDesktopDone(page)

  // 링크가 아니라 버튼, 크기는 서버 모드와 같은 92px
  await expect(page.locator('a.done__save')).toHaveCount(0)
  expect((await saveBtn(page).boundingBox())!.height).toBe(92)
  await expect(revealBtn(page)).toHaveCount(0)

  await saveBtn(page).click()
  await expect(page.getByRole('status')).toHaveText('다운로드 폴더에 「내 노래_1011.mp3」로 저장했어요.')
  expect(posted).toEqual(['POST'])
  expect(downloaded).toBe(false)
  const reveal = (await revealBtn(page).boundingBox())!
  expect(reveal.height).toBe(60)
  expect(await page.locator('.done__saved-text').evaluate((el) => getComputedStyle(el).fontSize)).toBe('22px')
  await shot(page, '07-done-desktop')

  await revealBtn(page).click()
  await expect.poll(() => revealed).toMatch(/\/api\/desktop\/reveal\/s1$/)
})

test('데스크톱 ⑦ 다시 누르면 한 벌 더 — 새 이름으로 안내가 바뀜', async ({ page }) => {
  let n = 0
  await page.route('**/api/exports/e1/save', (r) => {
    n++
    return json(r, { fileName: n === 1 ? '내 노래_1011.mp3' : `내 노래_1011 (${n}).mp3`, savedId: `s${n}` })
  })
  let revealed = ''
  await page.route('**/api/desktop/reveal/*', (r) => { revealed = r.request().url(); return r.fulfill({ status: 204 }) })
  await openDesktopDone(page)
  await saveBtn(page).click()
  await expect(page.getByRole('status')).toContainText('내 노래_1011.mp3')
  await saveBtn(page).click()
  await expect(page.getByRole('status')).toHaveText('다운로드 폴더에 「내 노래_1011 (2).mp3」로 저장했어요.')
  await revealBtn(page).click()
  await expect.poll(() => revealed).toMatch(/\/s2$/)
})

test('데스크톱 ⑦ 저장 실패(500 SAVE_FAILED) → 문구 그대로, 다시 누르면 저장', async ({ page }) => {
  let fail = true
  await page.route('**/api/exports/e1/save', (r) =>
    fail ? json(r, SAVE_FAILED, 500) : json(r, { fileName: '내 노래_1011.mp3', savedId: 's1' }))
  await openDesktopDone(page)
  await saveBtn(page).click()
  await expect(page.getByRole('alert')).toHaveText('컴퓨터에 저장하지 못했어요. 다시 눌러 주세요.')
  await expect(revealBtn(page)).toHaveCount(0)
  fail = false
  await saveBtn(page).click()
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('데스크톱 ⑦ [저장한 곳 열기]가 404(프로그램을 다시 켜 기록 없음) → 버튼만 숨김', async ({ page }) => {
  await page.route('**/api/exports/e1/save', (r) => json(r, { fileName: '내 노래_1011.mp3', savedId: 's1' }))
  await page.route('**/api/desktop/reveal/*', (r) =>
    json(r, { error: { code: 'NOT_FOUND', message: '노래를 찾을 수 없어요. 처음부터 다시 해주세요.' } }, 404))
  await openDesktopDone(page)
  await saveBtn(page).click()
  await revealBtn(page).click()
  await expect(revealBtn(page)).toHaveCount(0)
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('데스크톱 ⑦ 저장하다 401 → 다시 켜 달라는 안내', async ({ page }) => {
  await page.route('**/api/exports/e1/save', (r) => json(r, UNAUTHORIZED, 401))
  await openDesktopDone(page)
  await saveBtn(page).click()
  await expectRestart(page)
})

test('데스크톱 ⑦ "저장한 노래는 어디서 찾나요?" — 윈도우 프로그램 문구', async ({ page }) => {
  await openDesktopDone(page)
  await page.getByRole('link', { name: '저장한 노래는 어디서 찾나요?' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('[저장한 곳 열기]를 누르면 노래 파일이 있는 폴더가 열리고, 그 파일이 파랗게 표시돼요.')
  await expect(dialog).not.toContainText('Ctrl')
})
