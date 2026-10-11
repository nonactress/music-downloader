import type { ReactNode } from 'react'
import { Header, type StepNumber } from './Header'

export function Page({ step, children }: { step: StepNumber; children: ReactNode }) {
  return (
    <div className="page">
      <Header current={step} />
      {children}
    </div>
  )
}
