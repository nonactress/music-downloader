import { useEffect } from 'react'
import { HelpDialog } from './components/HelpDialog'
import { useFlowStore, type Screen } from './store/flowStore'
import { ImportPage } from './pages/ImportPage'
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

  useEffect(() => {
    document.title = `${TITLES[screen]} — 쉬운 음악 만들기`
    window.scrollTo(0, 0)
  }, [screen])

  return (
    <>
      <CurrentScreen screen={screen} />
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
