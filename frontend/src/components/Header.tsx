import { CheckIcon } from './Icons'

export type StepNumber = 1 | 2 | 3

const STEPS = ['노래 가져오기', '노래 다듬기', '저장하기'] as const

/** 공통 헤더: 이름 · 3단계 표시 · [가+ 글자 크게] [도움말] */
export function Header({ current }: { current: StepNumber }) {
  return (
    <header className="header">
      <div className="header__logo">쉬운 음악 만들기</div>
      <nav aria-label="진행 단계">
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
      </nav>
      <div className="header__tools">
        {/* 동작은 5단계 (PLAN 결정 13) */}
        <button type="button" className="header__btn">가+ 글자 크게</button>
        <button type="button" className="header__btn">도움말</button>
      </div>
    </header>
  )
}
