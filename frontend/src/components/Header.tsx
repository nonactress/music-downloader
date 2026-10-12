import { HELP_FOR_SCREEN } from '../lib/help'
import { useAuthStore } from '../store/authStore'
import { useFlowStore } from '../store/flowStore'
import { useUiStore } from '../store/uiStore'
import { CheckIcon } from './Icons'

export type StepNumber = 1 | 2 | 3

const STEPS = ['노래 가져오기', '노래 다듬기', '저장하기'] as const

/** 공통 헤더: 이름 · 3단계 표시 · [가+ 글자 크게] [도움말]. current가 없으면(로그인 화면) 3단계 표시 없음 */
export function Header({ current }: { current?: StepNumber }) {
  const bigText = useUiStore((s) => s.bigText)
  const toggleBigText = useUiStore((s) => s.toggleBigText)
  const openHelp = useUiStore((s) => s.openHelp)
  const screen = useFlowStore((s) => s.screen)
  const signedIn = useAuthStore((s) => s.status === 'in')
  return (
    <header className="header">
      <div className="header__logo">쉬운 음악 만들기</div>
      {current && <nav aria-label="진행 단계">
        <ol className="steps">
          {STEPS.map((label, i) => {
            const n = i + 1
            const state = n < current ? 'done' : n === current ? 'current' : 'todo'
            return (
              <li key={label} className={`step step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                {state === 'done' ? <CheckIcon size={22} /> : <span className="step__num">{n}</span>}
                {label}
              </li>
            )
          })}
        </ol>
      </nav>}
      <div className="header__tools">
        {/* 결정 46: 화면 전체 1.25배, 다시 누르면 원래대로 */}
        <button type="button" className="header__btn" aria-pressed={bigText} onClick={toggleBigText}>
          {bigText ? '가 글자 원래대로' : '가+ 글자 크게'}
        </button>
        {/* 결정 47: 지금 화면의 도움말 */}
        <button type="button" className="header__btn" aria-haspopup="dialog" onClick={() => openHelp(signedIn ? HELP_FOR_SCREEN[screen] : 'login')}>
          도움말
        </button>
      </div>
    </header>
  )
}
