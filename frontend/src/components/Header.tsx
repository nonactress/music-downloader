import { HELP_FOR_SCREEN } from '../lib/help'
import { useAuthStore } from '../store/authStore'
import { useFlowStore } from '../store/flowStore'
import { useUiStore } from '../store/uiStore'
import { CheckIcon } from './Icons'

export type StepNumber = 1 | 2 | 3

const STEPS = ['노래 가져오기', '노래 다듬기', '저장하기'] as const

/** 공통 헤더: 이름 · 3단계 표시 · [가+ 글자 크게] [도움말] · 로그인했으면 [나가기](윈도우 프로그램은 없음, 결정 70).
 *  current가 없으면(로그인 · 다시 켜기 화면) 3단계 표시 없음 */
export function Header({ current }: { current?: StepNumber }) {
  const bigText = useUiStore((s) => s.bigText)
  const toggleBigText = useUiStore((s) => s.toggleBigText)
  const openHelp = useUiStore((s) => s.openHelp)
  const screen = useFlowStore((s) => s.screen)
  const status = useAuthStore((s) => s.status)
  const desktop = useAuthStore((s) => s.desktop)
  const logout = useAuthStore((s) => s.logout)
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
        <button type="button" className="header__btn" aria-haspopup="dialog" onClick={() => openHelp(status === 'out' ? 'login' : HELP_FOR_SCREEN[screen])}>
          도움말
        </button>
        {/* 결정 59: "로그아웃" 대신 쉬운 말 */}
        {status === 'in' && !desktop && (
          <button type="button" className="header__btn" onClick={() => void logout()}>
            나가기
          </button>
        )}
      </div>
    </header>
  )
}
