import { useEffect } from 'react'
import { useFlowStore } from './store/flowStore'
import { ImportPage } from './pages/ImportPage'
import { LoadingPage } from './pages/LoadingPage'
import { DonePage } from './pages/DonePage'
import { EditPage } from './pages/EditPage'
import { SavingPage } from './pages/SavingPage'

const TITLES = {
  import: '노래 가져오기',
  loading: '불러오는 중',
  edit: '노래 다듬기',
  trim: '한 곡 잘라내기',
  saving: '노래 만드는 중',
  done: '저장 완료',
} as const

export function App() {
  const screen = useFlowStore((s) => s.screen)

  useEffect(() => {
    document.title = `${TITLES[screen]} — 쉬운 음악 만들기`
    window.scrollTo(0, 0)
  }, [screen])

  if (screen === 'loading') return <LoadingPage />
  if (screen === 'edit') return <EditPage />
  if (screen === 'saving') return <SavingPage />
  if (screen === 'done') return <DonePage />
  return <ImportPage />
}
