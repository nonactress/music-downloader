// 시작 / 끝 [−5초] 0:12 [+5초] — 더 못 가는 쪽은 비활성 (결정 19)
import { useId } from 'react'
import { formatClock } from '../lib/format'

interface Props {
  label: string
  value: number
  canDown: boolean
  canUp: boolean
  onDown: () => void
  onUp: () => void
}

export function TimeStepper({ label, value, canDown, canUp, onDown, onUp }: Props) {
  const id = useId()
  return (
    <div className="stepper" role="group" aria-labelledby={id}>
      <div className="stepper__label" id={id}>{label}</div>
      <div className="stepper__row">
        <button type="button" className="stepper__btn" onClick={onDown} disabled={!canDown}>−5초</button>
        <div className="stepper__value" aria-live="polite">{formatClock(value)}</div>
        <button type="button" className="stepper__btn" onClick={onUp} disabled={!canUp}>+5초</button>
      </div>
    </div>
  )
}
