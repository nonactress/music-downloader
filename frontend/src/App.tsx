import { useEffect } from 'react'
import { HelpDialog } from './components/HelpDialog'
import { useAuthStore } from './store/authStore'
import { useFlowStore, type Screen } from './store/flowStore'
import { ImportPage } from './pages/ImportPage'
import { LoginPage } from './pages/LoginPage'
import { RestartPage } from './pages/RestartPage'
import { LoadingPage } from './pages/LoadingPage'
import { DonePage } from './pages/DonePage'
import { EditPage } from './pages/EditPage'
import { SavingPage } from './pages/SavingPage'
import { SpeedAllPage } from './pages/SpeedAllPage'
import { SpeedPage } from './pages/SpeedPage'
import { TrimPage } from './pages/TrimPage'

const TITLES = {
  import: '노래 가져오기',
  loading: '불러오는 중',
  edit: '노래 다듬기',
  trim: '한 곡 잘라내기',
  speed: '한 곡 빠르기',
  speedAll: '모든 노래 빠르기',
  saving: '노래 만드는 중',
  done: '저장 완료',
} as const

export function App() {
  const screen = useFlowStore((s) => s.screen)
  const auth = useAuthStore((s) => s.status)

  useEffect(() => {
    if (auth === 'checking') return
    document.title = auth === 'restart'
      ? '쉬운 음악 만들기'
      : `${auth === 'out' ? '로그인' : TITLES[screen]} — 쉬운 음악 만들기`
    window.scrollTo(0, 0)
  }, [screen, auth])

  // 로그인했는지 확인하는 동안은 빈 배경만 (로그인 화면이 깜빡이지 않게)
  if (auth === 'checking') return <div className="page" />

  return (
    <>
      {auth === 'out' ? <LoginPage /> : auth === 'restart' ? <RestartPage /> : <CurrentScreen screen={screen} />}
      <HelpDialog />
    </>
  )
}

function CurrentScreen({ screen }: { screen: Screen }) {
  if (screen === 'loading') return <LoadingPage />
  if (screen === 'edit') return <EditPage />
  if (screen === 'speedAll') return <SpeedAllPage />
  if (screen === 'speed') return <SpeedPage />
  if (screen === 'trim') return <TrimPage />
  if (screen === 'saving') return <SavingPage />
  if (screen === 'done') return <DonePage />
  return <ImportPage />
}
