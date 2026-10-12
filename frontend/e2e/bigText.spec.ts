// F21 [가+ 글자 크게] — 화면 전체 1.25배, 버튼 글자 바뀜, 브라우저에 기억, 가로 스크롤 없음 (결정 46)
import { expect, test, type Page } from '@playwright/test'
import {
  appendSecond, exportDone, exportRunning, extractRunning, json, openEditHome, routeAudio, submitUrl,
} from './fixtures'

const bigBtn = (page: Page) => page.getByRole('button', { name: /글자/ })
/** 픽셀 반올림 오차 1px 안 */
const expectAbout = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)

/** 오른쪽 끝까지 밀어도 움직이지 않으면 가로 스크롤 없음 */
async function expectNoHorizontalScroll(page: Page, where: string) {
  const r = await page.evaluate(() => {
    window.scrollTo(100000, window.scrollY)
    const x = window.scrollX
    window.scrollTo(0, window.scrollY)
    const el = document.documentElement
    return { x, over: el.scrollWidth - el.clientWidth }
  })
  expect(r, `${where}: 가로 스크롤`).toEqual({ x: 0, over: 0 })
}

test('누르면 1.25배 · "가 글자 원래대로", 새로고침해도 유지, 다시 누르면 원래대로', async ({ page }) => {
  await page.goto('/')
  await expect(bigBtn(page)).toHaveText('가+ 글자 크게')
  const h1 = page.getByRole('heading', { name: '유튜브 주소를 넣어주세요' })
  const before = (await h1.boundingBox())!.height

  await bigBtn(page).click()
  await expect(bigBtn(page)).toHaveText('가 글자 원래대로')
  await expect(bigBtn(page)).toHaveAttribute('aria-pressed', 'true')
  expectAbout((await h1.boundingBox())!.height, before * 1.25)
  const btnHeight = (await bigBtn(page).boundingBox())!.height
  expect(btnHeight).toBeGreaterThanOrEqual(75)

  await page.reload()
  await expect(bigBtn(page)).toHaveText('가 글자 원래대로')
  expectAbout((await h1.boundingBox())!.height, before * 1.25)

  await bigBtn(page).click()
  await expect(bigBtn(page)).toHaveText('가+ 글자 크게')
  await expect(bigBtn(page)).toHaveAttribute('aria-pressed', 'false')
  expectAbout((await h1.boundingBox())!.height, before)
  await page.reload()
  await expect(bigBtn(page)).toHaveText('가+ 글자 크게')
})

for (const width of [1280, 1440]) {
  test(`글자 크게 ${width}px — 모든 화면에서 가로 스크롤 없음`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => localStorage.setItem('easy-music:big-text', '1'))
    await routeAudio(page)

    await page.goto('/')
    await expect(bigBtn(page)).toHaveText('가 글자 원래대로')
    await expectNoHorizontalScroll(page, '①')

    // ② — 불러오는 중에서 멈춰 둔다
    let extractDoneNow = false
    await page.route('**/api/jobs/j1', (r) => (extractDoneNow ? r.fallback() : json(r, extractRunning(60, 20))))
    await submitUrl(page)
    await expect(page.getByText('60% 완료')).toBeVisible()
    await expectNoHorizontalScroll(page, '②')
    await page.getByRole('button', { name: '취소하고 돌아가기' }).click()

    extractDoneNow = true
    await openEditHome(page)
    await appendSecond(page)
    await expectNoHorizontalScroll(page, '③')

    await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '잘라내기' }).click()
    await expect(page.getByRole('heading', { name: '1번 노래 잘라내기' })).toBeVisible()
    await expectNoHorizontalScroll(page, '④')
    await page.getByRole('button', { name: '완료, 목록으로' }).click()

    await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '빠르기', exact: true }).click()
    await expect(page.getByRole('heading', { name: '1번 노래 빠르기' })).toBeVisible()
    await expectNoHorizontalScroll(page, '⑤')
    await page.getByRole('radio', { name: '모든 노래' }).click()
    await expect(page.getByRole('heading', { name: '모든 노래 빠르기' })).toBeVisible()
    await expectNoHorizontalScroll(page, '⑥')
    await page.getByRole('button', { name: '바꾸지 않고 돌아가기' }).click()

    let exportDoneNow = false
    await page.route('**/api/exports', (r) => json(r, { jobId: 'j2', exportId: 'e1' }, 202))
    await page.route('**/api/jobs/j2', (r) => json(r, exportDoneNow ? exportDone() : exportRunning(40, 12)))
    await page.getByRole('button', { name: '다 됐어요, 저장하기' }).click()
    await expect(page.getByText('40% 완료')).toBeVisible()
    await expectNoHorizontalScroll(page, '저장 대기')
    exportDoneNow = true
    await expect(page.getByRole('heading', { name: '노래가 완성됐어요!' })).toBeVisible()
    await expectNoHorizontalScroll(page, '⑦')
  })
}
