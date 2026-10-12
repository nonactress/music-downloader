// F22 [도움말] 창 · "저장한 노래는 어디서 찾나요?" · ① 그림 3장 (결정 47, 문구 docs/HELP.md)
import { expect, test, type Page } from '@playwright/test'
import { exportDone, json, openEditHome, routeAudio, shot } from './fixtures'

const dialog = (page: Page) => page.getByRole('dialog')
const helpBtn = (page: Page) => page.getByRole('button', { name: '도움말' })

/** [도움말]을 눌러 제목 확인 → [닫기] */
async function checkHelp(page: Page, title: string) {
  await helpBtn(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('heading')).toHaveText(title)
  await dialog(page).getByRole('button', { name: '닫기' }).click()
  await expect(dialog(page)).toBeHidden()
}

test('① 도움말 — 큰 글씨 창 · 뒤 어둡게 · [닫기] 60px · Esc · 포커스 가두기 · 닫으면 [도움말]로', async ({ page }) => {
  await page.goto('/')
  await helpBtn(page).click()
  const d = dialog(page)
  await expect(d).toBeVisible()
  await expect(d).toHaveAccessibleName('노래를 가져오는 방법')
  await expect(d.getByRole('listitem')).toHaveText([
    '1.유튜브에서 넣고 싶은 노래 영상을 열어요.',
    '2.맨 위 주소창을 한 번 누르고, 마우스 오른쪽 버튼 → [복사]를 눌러요.',
    '3.이 화면으로 돌아와 [붙여넣기]를 누르면 주소가 들어가요.',
    '4.[노래 불러오기]를 누르면 노래를 가져와요.',
  ])
  await expect(d.getByText('재생목록 주소는 넣을 수 없어요. 노래 영상 하나의 주소를 넣어 주세요. 20분이 넘는 영상도 가져올 수 없어요.')).toBeVisible()

  // 큰 글씨: 본문 24px, 제목 34px, [닫기] 60px 이상
  const size = (sel: string) => d.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(await size('.help__step')).toBeGreaterThanOrEqual(24)
  expect(await size('.help__title')).toBeGreaterThanOrEqual(34)
  const close = d.getByRole('button', { name: '닫기' })
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(60)

  // 뒤 화면 어둡게 (::backdrop)
  const backdrop = await d.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor)
  expect(backdrop).toBe('rgba(0, 0, 0, 0.6)')

  // 포커스: 처음 [닫기], Tab · Shift+Tab을 눌러도 창 밖으로 안 나감
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()

  await shot(page, 'help-01-import')

  // Esc로 닫힘 → 포커스는 [도움말]로
  await page.keyboard.press('Escape')
  await expect(d).toBeHidden()
  await expect(helpBtn(page)).toBeFocused()

  // 어두운 바깥을 눌러도 닫힘
  await helpBtn(page).click()
  await expect(d).toBeVisible()
  await page.mouse.click(10, 10)
  await expect(d).toBeHidden()
})

test('화면마다 그 화면의 도움말 (③ ④ ⑤ ⑥ ⑦ · 저장한 노래 찾기)', async ({ page }) => {
  await routeAudio(page)
  await openEditHome(page)
  await checkHelp(page, '노래를 다듬는 방법')

  await page.getByRole('button', { name: '잘라내기' }).click()
  await checkHelp(page, '잘라내는 방법')
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await page.getByRole('button', { name: '빠르기', exact: true }).click()
  await checkHelp(page, '빠르기를 바꾸는 방법')
  await page.getByRole('button', { name: '완료, 목록으로' }).click()

  await page.getByRole('button', { name: /모든 노래 빠르기 바꾸기/ }).click()
  await checkHelp(page, '빠르기를 바꾸는 방법')
  await page.getByRole('button', { name: '바꾸지 않고 돌아가기' }).click()

  await page.route('**/api/exports', (r) => json(r, { jobId: 'j2', exportId: 'e1' }, 202))
  await page.route('**/api/jobs/j2', (r) => json(r, exportDone()))
  await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
  await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
  await helpBtn(page).click()
  await expect(dialog(page).getByRole('heading')).toHaveText('저장하는 방법')
  await expect(dialog(page).getByText('만든 노래는 하루(24시간)가 지나면 이 사이트에서 지워져요. 그 전에 저장해 주세요.')).toBeVisible()
  await page.keyboard.press('Escape')

  // ⑦ 링크 → 같은 창
  const link = page.getByRole('link', { name: '저장한 노래는 어디서 찾나요?' })
  await link.click()
  const d = dialog(page)
  await expect(d.getByRole('heading')).toHaveText('저장한 노래 찾기')
  await expect(d.locator('b')).toHaveText(['다운로드', 'Ctrl', 'J', '⌘', 'Option', 'L'])
  await expect(d.getByText('파일 이름은 "내 노래_월일.mp3"예요. 예: 내 노래_1011.mp3')).toBeVisible()
  await shot(page, 'help-07-find-saved')
  await d.getByRole('button', { name: '닫기' }).click()
  await expect(link).toBeFocused()
})

test('② 불러오는 중 도움말 — 기다리는 동안', async ({ page }) => {
  await page.route('**/api/tracks', (r) => json(r, { jobId: 'j1', trackId: 't1' }, 202))
  await page.route('**/api/jobs/j1', (r) =>
    json(r, { jobId: 'j1', kind: 'extract', status: 'running', progress: 30, etaSeconds: 40, track: null, result: null, error: null }))
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await page.getByRole('button', { name: '노래 불러오기' }).click()
  await expect(page.getByText('30% 완료')).toBeVisible()
  await checkHelp(page, '기다리는 동안')
})

test('① 그림 3장 — 자리표시 대신 직접 그린 그림 (설명 글 포함)', async ({ page }) => {
  await page.goto('/')
  const pics = page.locator('.howto__pic svg[role="img"]')
  await expect(pics).toHaveCount(3)
  await expect(page.getByText(/\[화면 그림/)).toHaveCount(0)
  await expect(pics.nth(2)).toHaveAccessibleName(/\[복사\]/)
  await expect(page.locator('.howto__text')).toHaveText([
    '1. 유튜브에서 노래 영상을 열어요',
    '2. 맨 위 주소창을 한 번 눌러요',
    '3. 마우스 오른쪽 → [복사]',
  ])
})
