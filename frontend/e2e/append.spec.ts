// 노래 하나 더 붙이기 (결정 36 · 37) — docs/wireframes/html/Edit.html, Loading.html
import { expect, test, type Page } from '@playwright/test'
import { extractRunning, json, openEditHome } from './fixtures'

const track2 = { trackId: 't2', title: '[두 번째 노래 제목]', channel: '[채널]', durationSec: 240, thumbnailUrl: '' }

/** 붙이기 요청은 j3/t2로 — 나중에 등록한 route가 먼저 처리된다 */
async function routeAppend(page: Page, job: (n: number) => unknown) {
  let polls = 0
  await page.route('**/api/tracks', (r) => json(r, { jobId: 'j3', trackId: 't2' }, 202))
  await page.route('**/api/jobs/j3', (r) => json(r, job(++polls)))
}

const done2 = { jobId: 'j3', kind: 'extract', status: 'done', progress: 100, etaSeconds: 0, track: track2, result: { track: track2 }, error: null }

async function appendUrl(page: Page, url = 'https://youtu.be/second') {
  await page.getByLabel('노래 하나 더 붙이기').fill(url)
  await page.getByRole('button', { name: '불러와서 붙이기' }).click()
}

test('붙이기 → ② 재사용(헤더 2단계) → ③ 맨 아래 + 알림 + 되돌리기', async ({ page }) => {
  await openEditHome(page)
  await routeAppend(page, (n) => (n < 3 ? { ...extractRunning(40, 5, track2), jobId: 'j3' } : done2))
  await appendUrl(page)

  await expect(page.getByRole('heading', { name: '노래를 가져오고 있어요' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '노래 다듬기' })).toHaveAttribute('aria-current', 'step')

  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible()
  const second = page.getByRole('article', { name: '2번 노래' })
  await expect(second.getByText('[두 번째 노래 제목]')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText(/2번 노래를 붙였어요/)
  await expect(second.getByText('방금 바뀜')).toBeVisible()
  // 3분 45초 + 4분 0초 − 잇기 2초 (CONTRACT 3-4)
  await expect(page.getByText('전체 길이 7분 43초')).toBeVisible()
  await expect(page.getByLabel('노래 하나 더 붙이기')).toHaveValue('')

  await page.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
})

test('붙이기 [취소하고 돌아가기] → ③, 실패는 message + [다시 해보기] → ③(주소 유지)', async ({ page }) => {
  await openEditHome(page)
  let fail = false
  await routeAppend(page, () =>
    fail
      ? { jobId: 'j3', kind: 'extract', status: 'failed', progress: 10, etaSeconds: null, track: null, result: null,
          error: { code: 'VIDEO_UNAVAILABLE', message: '이 영상은 가져올 수 없어요. 다른 영상을 골라주세요.' } }
      : { ...extractRunning(10, null, track2), jobId: 'j3' })
  await appendUrl(page)
  await page.getByRole('button', { name: '취소하고 돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '노래를 다듬어 주세요' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)

  fail = true
  await appendUrl(page, 'https://youtu.be/broken')
  await expect(page.getByRole('alert')).toHaveText('이 영상은 가져올 수 없어요. 다른 영상을 골라주세요.')
  await page.getByRole('button', { name: '다시 해보기' }).click()
  await expect(page.getByLabel('노래 하나 더 붙이기')).toHaveValue('https://youtu.be/broken')
})

test('붙이기 주소 검사는 ①과 같음 — 서버에 보내지 않음', async ({ page }) => {
  await openEditHome(page)
  let called = false
  await page.route('**/api/tracks', (r) => { called = true; return json(r, {}) })
  await appendUrl(page, 'https://www.youtube.com/playlist?list=PL1')
  await expect(page.getByRole('alert')).toHaveText('재생목록은 가져올 수 없어요. 노래 영상 하나의 주소를 넣어주세요.')
  expect(called).toBe(false)
})

test('20곡이면 입력 · 버튼 비활성 + 안내 (결정 37)', async ({ page }) => {
  test.setTimeout(120_000)
  await openEditHome(page)
  let k = 0
  await page.route('**/api/tracks', (r) => { k += 1; return json(r, { jobId: `ja${k}`, trackId: `ta${k}` }, 202) })
  await page.route('**/api/jobs/ja*', (r) => {
    const id = r.request().url().split('/ja').pop()
    const t = { trackId: `ta${id}`, title: `노래 ${id}`, channel: 'c', durationSec: 30, thumbnailUrl: '' }
    return json(r, { jobId: `ja${id}`, kind: 'extract', status: 'done', progress: 100, etaSeconds: 0, track: t, result: { track: t }, error: null })
  })
  for (let i = 2; i <= 20; i++) {
    await appendUrl(page, `https://youtu.be/v${i}`)
    await expect(page.getByRole('article', { name: `${i}번 노래` })).toBeVisible()
  }
  await expect(page.getByLabel('노래 하나 더 붙이기')).toBeDisabled()
  await expect(page.getByRole('button', { name: '불러와서 붙이기' })).toBeDisabled()
  await expect(page.getByText('노래는 20곡까지 붙일 수 있어요')).toBeVisible()
})
