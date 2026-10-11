import type { ReactNode } from 'react'
import { Header, type StepNumber } from './Header'

/** minHeight: 와이어프레임 화면마다 다른 최소 높이 (Main 960, Edit 1240, Trim 1000) */
export function Page({ step, minHeight, children }: { step: StepNumber; minHeight?: number; children: ReactNode }) {
  return (
    <div className="page" style={minHeight ? { minHeight } : undefined}>
      <Header current={step} />
      {children}
    </div>
  )
}
