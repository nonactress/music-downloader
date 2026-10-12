import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // 스크린샷 이름 중복 검사 기록을 비운다
  globalSetup: './e2e/globalSetup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 960 },
    locale: 'ko-KR',
    // 진행 막대 애니메이션 없이 찍기
    contextOptions: { reducedMotion: 'reduce' },
    // 설치된 Chrome 사용 (PW_CHANNEL= 로 비우면 번들 Chromium)
    channel: process.env.PW_CHANNEL ?? 'chrome',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
