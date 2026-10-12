// F31 ④ 손잡이 마우스 끌기 · 키보드 (결정 63) — 버튼은 그대로
import { expect, test, type Page } from './fixtures'
import { openEditHome, routeAudio } from './fixtures'
import { SHOTS } from './fixtures'

const DURATION = 225
const slider = (page: Page, name: '시작 손잡이' | '끝 손잡이') => page.getByRole('slider', { name })
const group = (page: Page, name: '시작' | '끝') => page.getByRole('group', { name })
const valueOf = async (page: Page, name: '시작 손잡이' | '끝 손잡이') =>
  Number(await slider(page, name).getAttribute('aria-valuenow'))

async function openTrim(page: Page) {
  await routeAudio(page)
  await openEditHome(page)
  await page.getByRole('article', { name: '1번 노래' }).getByRole('button', { name: '잘라내기' }).click()
  await expect(page.locator('.wave[data-ready]')).toBeVisible()
}

async function waveBox(page: Page) {
  return (await page.locator('.wave').boundingBox())!
}

/** 보이는 손잡이(파란 네모)의 가운데 x */
async function handleCenter(page: Page, edge: 'start' | 'end') {
  const b = (await page.locator(`.wave__grip--${edge} .wave__handle`).boundingBox())!
  return b.x + b.width / 2
}

/** 손잡이 경계에서 grabDx만큼 떨어진 곳을 잡고 dSec초만큼 끌기. 놓기 전에 확인할 것이 있으면 during */
async function dragBy(page: Page, edge: 'start' | 'end', grabDx: number, dSec: number, during?: () => Promise<void>) {
  const box = await waveBox(page)
  const sec = await valueOf(page, edge === 'start' ? '시작 손잡이' : '끝 손잡이')
  const x = box.x + (box.width * sec) / DURATION + grabDx
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + (box.width * dSec) / DURATION, y, { steps: 8 })
  if (during) await during()
  await page.mouse.up()
}

test('④ 시작 손잡이를 끌면 즉시 반영 — 끄는 동안 위에 시간, 0.1초 단위, 버튼 · 숫자도 같이', async ({ page }) => {
  await openTrim(page)
  await expect(page.getByText('파란 부분 양 끝의 손잡이를 마우스로 끌어서 옮길 수도 있어요.')).toHaveCSS('font-size', '20px')

  await dragBy(page, 'start', 20, 30, async () => {
    await expect(page.locator('.wave__time')).toHaveText('0:30')
    // 마우스를 누른 채로 찍어야 하므로 shot()(마우스를 치움) 대신 직접
    await page.screenshot({ path: `${SHOTS}/04-trim-dragging.png` })
  })
  await expect(page.locator('.wave__time')).toHaveCount(0)
  const v = await valueOf(page, '시작 손잡이')
  expect(Math.abs(v - 30)).toBeLessThanOrEqual(0.15)
  expect(Math.round(v * 10) / 10).toBe(v)
  await expect(group(page, '시작')).toContainText('0:30')
  await expect(page.getByText('남는 길이 3분 15초')).toBeVisible()
  await expect(slider(page, '시작 손잡이')).toBeFocused()
  // 보이는 손잡이도 그 자리에
  const box = await waveBox(page)
  expect(Math.abs((await handleCenter(page, 'start')) - (box.x + (box.width * v) / DURATION))).toBeLessThanOrEqual(1)

  // 버튼도 그대로 동작 (끈 값에서 +5초)
  await group(page, '시작').getByRole('button', { name: '+5초' }).click()
  expect(await valueOf(page, '시작 손잡이')).toBeCloseTo(v + 5, 5)
})

test('④ 끝 손잡이 끌기 · 범위 · 최소 1초(결정 19)', async ({ page }) => {
  await openTrim(page)
  await dragBy(page, 'end', -20, -60)
  expect(Math.abs((await valueOf(page, '끝 손잡이')) - 165)).toBeLessThanOrEqual(0.15)
  await expect(group(page, '끝')).toContainText('2:45')

  // 끝 너머 · 처음 너머로 끌면 0 · 원곡 길이에서 멈춤
  await dragBy(page, 'end', -20, 200)
  expect(await valueOf(page, '끝 손잡이')).toBe(DURATION)
  await dragBy(page, 'start', 20, -50)
  expect(await valueOf(page, '시작 손잡이')).toBe(0)

  // 시작을 끝 너머로 끌어도 1초는 남김
  await dragBy(page, 'start', 20, 300)
  expect(await valueOf(page, '시작 손잡이')).toBe(DURATION - 1)
  await expect(page.getByText('남는 길이 1초')).toBeVisible()
  // 둘이 붙어 잡는 범위가 겹쳐도 누른 곳에 가까운 쪽: 시작보다 왼쪽을 잡으면 시작이 움직임
  await dragBy(page, 'start', -30, -100)
  expect(Math.abs((await valueOf(page, '시작 손잡이')) - (DURATION - 101))).toBeLessThanOrEqual(0.15)
  expect(await valueOf(page, '끝 손잡이')).toBe(DURATION)
})

test('④ 끈 것은 나갈 때 되돌리기 1번 (결정 22), 끌기 시작하면 미리듣기 멈춤', async ({ page }) => {
  await openTrim(page)
  await page.getByRole('button', { name: '남긴 부분 들어보기' }).click()
  await expect(page.getByRole('button', { name: '멈추기' })).toBeVisible()
  await dragBy(page, 'start', 20, 10, async () => {
    await expect(page.getByRole('button', { name: '남긴 부분 들어보기' })).toBeVisible()
  })
  await dragBy(page, 'end', -20, -15)
  await page.getByRole('button', { name: '완료, 목록으로' }).click()
  await expect(page.getByRole('status')).toHaveText(/1번 노래를 3분 20초로 잘랐어요/)
  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(page.getByText('3분 45초 · 보통 빠르기')).toBeVisible()
  await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toHaveCount(0)
})

test('④ 키보드: 손잡이는 슬라이더, ←/→ 1초 · Shift 5초, Home/End', async ({ page }) => {
  await openTrim(page)
  const start = slider(page, '시작 손잡이')
  await expect(start).toHaveAttribute('aria-valuemin', '0')
  await expect(start).toHaveAttribute('aria-valuemax', '224')
  await expect(start).toHaveAttribute('aria-valuetext', '0초')
  await start.focus()
  await page.keyboard.press('ArrowRight')
  await expect(start).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(start).toHaveAttribute('aria-valuenow', '6')
  await page.keyboard.press('ArrowLeft')
  await expect(start).toHaveAttribute('aria-valuenow', '5')
  await expect(group(page, '시작')).toContainText('0:05')

  const end = slider(page, '끝 손잡이')
  await end.focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(end).toHaveAttribute('aria-valuenow', '220')
  await expect(end).toHaveAttribute('aria-valuemin', '6')
  await page.keyboard.press('Home')
  await expect(end).toHaveAttribute('aria-valuenow', '6')
  await page.keyboard.press('End')
  await expect(end).toHaveAttribute('aria-valuenow', String(DURATION))
})

test('④ 잡는 범위 폭 48px 이상 — 손잡이가 맨 끝에 있어도 파형 안에서', async ({ page }) => {
  await openTrim(page)
  const box = await waveBox(page)
  for (const edge of ['start', 'end'] as const) {
    const g = (await page.locator(`.wave__grip--${edge}`).boundingBox())!
    const inside = Math.min(g.x + g.width, box.x + box.width) - Math.max(g.x, box.x)
    expect(inside).toBeGreaterThanOrEqual(48)
    await expect(page.locator(`.wave__grip--${edge}`)).toHaveCSS('cursor', 'ew-resize')
  }
})

test('④ 글자 크게(zoom 1.25)에서도 손잡이 위치 · 끌기 좌표가 맞음', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('easy-music:big-text', '1'))
  await openTrim(page)
  await expect(page.getByRole('button', { name: '가 글자 원래대로' })).toBeVisible()

  await dragBy(page, 'start', 20, 30)
  await dragBy(page, 'end', -20, -45)
  const s = await valueOf(page, '시작 손잡이')
  const e = await valueOf(page, '끝 손잡이')
  expect(Math.abs(s - 30)).toBeLessThanOrEqual(0.15)
  expect(Math.abs(e - 180)).toBeLessThanOrEqual(0.15)
  const box = await waveBox(page)
  expect(Math.abs((await handleCenter(page, 'start')) - (box.x + (box.width * s) / DURATION))).toBeLessThanOrEqual(1.5)
  expect(Math.abs((await handleCenter(page, 'end')) - (box.x + (box.width * e) / DURATION))).toBeLessThanOrEqual(1.5)
})
