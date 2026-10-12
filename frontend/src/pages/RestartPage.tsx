// 윈도우 프로그램인데 세션이 없을 때 (CONTRACT 7-2, 결정 70) — 와이어프레임 없음, 로그인 화면 틀에 안내 한 줄만
import { ErrorBox } from '../components/ErrorBox'
import { Page } from '../components/Page'
import { RESTART_PROGRAM } from '../store/authStore'

export function RestartPage() {
  return (
    <Page>
      <main className="login">
        <ErrorBox message={RESTART_PROGRAM} className="error-box--login" />
      </main>
    </Page>
  )
}
