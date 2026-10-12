import { defineConfig } from '@playwright/test'

// PW_BASE_URL=http://localhost:8080 이면 dev 서버 대신 그 주소(nginx web)로 — 배포 구성 확인용
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // 스크린샷 이름 중복 검사 기록을 비운다
  globalSetup: './e2e/globalSetup.ts',
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    locale: 'ko-KR',
    // 진행 막대 애니메이션 없이 찍기
    contextOptions: { reducedMotion: 'reduce' },
    // 설치된 Chrome 사용 (PW_CHANNEL= 로 비우면 번들 Chromium)
    channel: process.env.PW_CHANNEL ?? 'chrome',
  },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
})
