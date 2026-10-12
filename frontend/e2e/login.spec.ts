// F27 ⓪ 로그인 — Login.html · 00-login.png, CONTRACT 5장
import { expect, test, type Page } from './fixtures'
import { UNAUTHORIZED, USER, json, shot } from './fixtures'

const LOGIN_FAILED = { error: { code: 'LOGIN_FAILED', message: '아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.' } }
const LOGIN_LOCKED = { error: { code: 'LOGIN_LOCKED', message: '여러 번 틀려서 잠시 막혔어요. 15분 뒤에 다시 해 주세요.' } }

/** 로그인 안 된 상태 — /auth/me 401 */
async function signedOut(page: Page) {
  await page.route('**/api/auth/me', (r) => json(r, UNAUTHORIZED, 401))
}

test('⓪ 로그인 안 됐으면 로그인 화면 — 3단계 표시 없음, 와이어프레임 장면(빈 칸으로 누르면 안내)', async ({ page }) => {
  let called = false
  await signedOut(page)
  await page.route('**/api/auth/login', (r) => { called = true; return json(r, LOGIN_FAILED, 401) })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '로그인해 주세요' })).toBeVisible()
  await expect(page).toHaveTitle('로그인 — 쉬운 음악 만들기')
  await expect(page.getByRole('navigation', { name: '진행 단계' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '가+ 글자 크게' })).toBeVisible()
  await expect(page.getByRole('button', { name: '나가기' })).toHaveCount(0)
  await expect(page.getByText('아이디와 비밀번호는 관리자에게 받아요. 잊어버렸으면 관리자에게 물어보세요.')).toBeVisible()

  // 크기: 입력칸 80px · 글자 24px, [로그인] 88px, 보이기 60px
  const box = async (name: string) => (await page.getByLabel(name, { exact: true }).boundingBox())!.height
  expect(await box('아이디')).toBe(80)
  expect(await box('비밀번호')).toBe(80)
  expect(await page.getByLabel('아이디', { exact: true }).evaluate((el) => getComputedStyle(el).fontSize)).toBe('24px')
  expect((await page.getByRole('button', { name: '로그인' }).boundingBox())!.height).toBe(88)
  expect((await page.locator('.login__show').boundingBox())!.height).toBeGreaterThanOrEqual(60)

  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert')).toHaveText('아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.')
  expect(called).toBe(false)
  await shot(page, '00-login')
})

test('⓪ 로그인 성공 → ① (요청 본문은 CONTRACT 5-2), Enter로도', async ({ page }) => {
  let posted: unknown = null
  await signedOut(page)
  await page.route('**/api/auth/login', (r) => {
    posted = r.request().postDataJSON()
    return json(r, { user: USER })
  })
  await page.goto('/')
  await page.getByLabel('아이디', { exact: true }).fill('Grandma')
  await page.getByLabel('비밀번호', { exact: true }).fill('비밀 번호')
  await page.getByLabel('비밀번호', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await expect(page).toHaveTitle('노래 가져오기 — 쉬운 음악 만들기')
  // 소문자 · 공백 정리는 서버가 (CONTRACT 5-2), 프론트는 넣은 그대로
  expect(posted).toEqual({ loginId: 'Grandma', password: '비밀 번호' })
})

test('⓪ 틀리면 LOGIN_FAILED, 여러 번이면 LOGIN_LOCKED 문구 그대로 — 고치면 안내 지움', async ({ page }) => {
  let locked = false
  await signedOut(page)
  await page.route('**/api/auth/login', (r) => (locked ? json(r, LOGIN_LOCKED, 429) : json(r, LOGIN_FAILED, 401)))
  await page.goto('/')
  await page.getByLabel('아이디', { exact: true }).fill('grandma')
  await page.getByLabel('비밀번호', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert')).toHaveText('아이디나 비밀번호가 맞지 않아요. 다시 확인해 주세요.')
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('aria-describedby', 'login-error')
  // 401이어도 로그인 화면 그대로 (다른 API의 401과 다름)
  await expect(page.getByRole('heading', { name: '로그인해 주세요' })).toBeVisible()

  await page.getByLabel('비밀번호', { exact: true }).fill('wrong2')
  await expect(page.getByRole('alert')).toHaveCount(0)

  locked = true
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert')).toHaveText('여러 번 틀려서 잠시 막혔어요. 15분 뒤에 다시 해 주세요.')
})

test('⓪ [비밀번호 보이기] — 누르면 글자가 보이고, 다시 누르면 가림', async ({ page }) => {
  await signedOut(page)
  await page.goto('/')
  const pw = page.getByLabel('비밀번호', { exact: true })
  await pw.fill('1234')
  await expect(pw).toHaveAttribute('type', 'password')
  await page.getByText('비밀번호 보이기').click()
  await expect(page.getByRole('checkbox', { name: '비밀번호 보이기' })).toBeChecked()
  await expect(pw).toHaveAttribute('type', 'text')
  await expect(pw).toHaveValue('1234')
  await page.getByRole('checkbox', { name: '비밀번호 보이기' }).uncheck()
  await expect(pw).toHaveAttribute('type', 'password')
})

test('⓪ [도움말]은 HELP.md ⓪ 로그인', async ({ page }) => {
  await signedOut(page)
  await page.goto('/')
  await page.getByRole('button', { name: '도움말' }).click()
  const d = page.getByRole('dialog')
  await expect(d).toHaveAccessibleName('로그인하는 방법')
  await expect(d.getByRole('listitem')).toHaveCount(4)
  await expect(d.getByText('아이디나 비밀번호를 잊어버렸으면 관리자에게 물어보세요.')).toBeVisible()
})

test('⓪ 이미 로그인돼 있으면(GET /auth/me 200) 바로 원래 화면', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '로그인해 주세요' })).toHaveCount(0)
})

test('⓪ 서버에 닿지 않아도 로그인 화면 — 로그인하면 안내', async ({ page }) => {
  await page.route('**/api/auth/me', (r) => r.abort())
  await page.route('**/api/auth/login', (r) => r.abort())
  await page.goto('/')
  await page.getByLabel('아이디', { exact: true }).fill('grandma')
  await page.getByLabel('비밀번호', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert')).toHaveText('문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
})

test('⓪ 글자 크게 1440px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('easy-music:big-text', '1'))
  await signedOut(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: '가 글자 원래대로' })).toBeVisible()
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await shot(page, 'big-00-login')
})
