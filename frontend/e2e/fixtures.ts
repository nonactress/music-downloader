// /api를 CONTRACT 형식 응답으로 가로채는 도우미
import { mkdirSync, openSync, closeSync } from 'node:fs'
import { test as base, type Page, type Route } from '@playwright/test'

export { expect, type Page } from '@playwright/test'

export const SHOTS = 'e2e/screenshots'
/** 이번 실행에서 찍은 이름 — 워커가 여러 개라 파일로 남긴다 (globalSetup이 비움) */
export const SHOT_NAMES = `${SHOTS}/.taken`
export const URL_OK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

// 와이어프레임 자리표시 문구와 같은 값으로 채워 비교하기 쉽게 한다
export const track = {
  trackId: 't1',
  title: '[노래 제목]',
  channel: '[채널 이름]',
  durationSec: 225,
  thumbnailUrl: '',
}

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })

export const extractRunning = (progress: number, etaSeconds: number | null, t = track) => ({
  jobId: 'j1', kind: 'extract', status: 'running', progress, etaSeconds, track: t, result: null, error: null,
})
export const extractDone = (t = track) => ({
  jobId: 'j1', kind: 'extract', status: 'done', progress: 100, etaSeconds: 0, track: t, result: { track: t }, error: null,
})
export const exportRunning = (progress: number, etaSeconds: number | null) => ({
  jobId: 'j2', kind: 'export', status: 'running', progress, etaSeconds, track: null, result: null, error: null,
})
export const exportDone = (trackCount = 2, durationSec = 380) => ({
  jobId: 'j2', kind: 'export', status: 'done', progress: 100, etaSeconds: 0, track: null,
  result: { exportId: 'e1', fileName: '내 노래_1011.mp3', trackCount, durationSec, sizeBytes: 6082560 },
  error: null,
})

export const USER = { loginId: 'grandma' }
export const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: '로그인이 필요해요. 다시 로그인해 주세요.' } }

/** 모든 테스트는 로그인된 상태로 시작 (CONTRACT 5-4) — 새 탭에도 적용되게 context에.
 *  로그인 화면 테스트는 page.route로 /auth/me를 401로 다시 가로챈다 (page 쪽이 먼저) */
export const test = base.extend<{ signedIn: void }>({
  signedIn: [
    async ({ context }, use) => {
      await context.route('**/api/auth/me', (r) => json(r, { user: USER }))
      await context.route('**/api/auth/logout', (r) => r.fulfill({ status: 204 }))
      await use()
    },
    { auto: true },
  ],
})

export async function submitUrl(page: Page) {
  await page.route('**/api/tracks', (r) => json(r, { jobId: 'j1', trackId: 't1' }, 202))
  await page.goto('/')
  await page.getByLabel('유튜브 주소').fill(URL_OK)
  await page.getByRole('button', { name: '노래 불러오기' }).click()
}

/** ①에서 주소를 넣고 추출이 끝나 ③ 편집 홈까지 */
export async function openEditHome(page: Page, t = track) {
  await page.route('**/api/jobs/j1', (r) => json(r, extractDone(t)))
  await page.route('**/api/tracks/*/peaks', (r) =>
    json(r, {
      trackId: t.trackId,
      durationSec: t.durationSec,
      pointsPerSecond: 20,
      peaks: Array.from({ length: Math.ceil(t.durationSec * 20) }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i / 7))),
    }))
  await submitUrl(page)
  await page.getByRole('heading', { name: '노래를 다듬어 주세요' }).waitFor()
}

/** 같은 이름을 두 번 찍으면 실패 — 다른 테스트의 화면을 덮어쓰지 않게 */
export async function shot(page: Page, name: string) {
  mkdirSync(SHOT_NAMES, { recursive: true })
  try {
    closeSync(openSync(`${SHOT_NAMES}/${name}`, 'wx'))
  } catch {
    throw new Error(`스크린샷 이름 ${name}을(를) 이번 실행에서 이미 찍었어요`)
  }
  await page.evaluate(() => document.fonts.ready)
  // 마우스가 올라간 버튼 색(hover) 없이 찍기
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

/** 무음 WAV (8kHz 8bit 모노) — 미리듣기 재생 확인용 */
export function silentWav(seconds: number): Buffer {
  const rate = 8000
  const n = rate * seconds
  const b = Buffer.alloc(44 + n)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(n, 40)
  b.fill(128, 44)
  return b
}

export async function routeAudio(page: Page, seconds = 225) {
  const body = silentWav(seconds)
  await page.route('**/api/tracks/*/audio', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body }))
}

export const track2 = { trackId: 't2', title: '[두 번째 노래 제목]', channel: '[채널]', durationSec: 240, thumbnailUrl: '' }

/** ③에서 2번 노래(track2)를 붙여 2곡으로 만든다 */
export async function appendSecond(page: Page, t = track2) {
  await page.route('**/api/tracks', (r) => json(r, { jobId: 'j3', trackId: t.trackId }, 202))
  await page.route('**/api/jobs/j3', (r) =>
    json(r, { jobId: 'j3', kind: 'extract', status: 'done', progress: 100, etaSeconds: 0, track: t, result: { track: t }, error: null }))
  await page.getByLabel('노래 하나 더 붙이기').fill('https://youtu.be/second')
  await page.getByRole('button', { name: '불러와서 붙이기' }).click()
  await page.getByRole('article', { name: '2번 노래' }).waitFor()
}
