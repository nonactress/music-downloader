// ② 불러오는 중 화면 모양 — 추출 · 저장 대기(결정 16)가 함께 쓴다. docs/wireframes/html/Loading.html
import type { ReactNode } from 'react'
import { ErrorBox } from './ErrorBox'
import { Page } from './Page'
import type { StepNumber } from './Header'

interface Props {
  step: StepNumber
  heading: string
  thumbnailUrl?: string
  title: string
  sub?: string
  percent: number
  etaSeconds: number | null
  notice: ReactNode
  error: string | null
  onCancel: () => void
  onRetry: () => void
}

export function ProgressScreen(p: Props) {
  const percent = Math.max(0, Math.min(100, Math.floor(p.percent)))
  return (
    <Page step={p.step}>
      <main className="loading">
        <h1 className="h1">{p.heading}</h1>

        <div className="loading__card">
          {p.thumbnailUrl ? (
            <img className="loading__thumb" src={p.thumbnailUrl} alt="" />
          ) : (
            <div className="loading__thumb" aria-hidden="true" />
          )}
          <div className="loading__info">
            <div className="loading__meta">
              <div className="loading__title">{p.title}</div>
              {p.sub && <div className="loading__sub">{p.sub}</div>}
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-label="진행률"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <div className="loading__status" aria-live="polite">
              <span className="loading__percent">{percent}% 완료</span>
              {p.etaSeconds !== null && !p.error && (
                <span className="loading__eta">약 {p.etaSeconds}초 남았어요</span>
              )}
            </div>
          </div>
        </div>

        {p.error ? <ErrorBox message={p.error} /> : <div className="notice">{p.notice}</div>}

        <div className="loading__actions">
          {p.error ? (
            <button type="button" className="btn-primary loading__retry" onClick={p.onRetry}>
              다시 해보기
            </button>
          ) : (
            <button type="button" className="btn-outline loading__cancel" onClick={p.onCancel}>
              취소하고 돌아가기
            </button>
          )}
        </div>
      </main>
    </Page>
  )
}
