// 빠르기 프리셋 · 조금씩 바꾸기 · 목소리 높낮이 — ⑤ 한 곡 빠르기와 ⑥ 모든 노래 빠르기가 함께 쓴다.
// docs/wireframes/html/Speed.html, SpeedAll.html
import {
  SPEED_PRESETS, SPEED_STEP, canFaster, canSlower, formatRate, isSameSpeed, normalizeSpeed,
} from '../lib/speed'
import { CheckIcon } from './Icons'

interface Props {
  speed: number
  keepPitch: boolean
  onSpeed: (speed: number) => void
  onKeepPitch: (keep: boolean) => void
}

export function SpeedControls({ speed, keepPitch, onSpeed, onKeepPitch }: Props) {
  return (
    <>
      <div className="presets" role="group" aria-label="빠르기 고르기">
        {SPEED_PRESETS.map((p) => {
          // 결정 26: 값이 정확히 같을 때만 선택 표시
          const on = isSameSpeed(speed, p.value)
          return (
            <button
              key={p.name}
              type="button"
              className={`preset${on ? ' preset--on' : ''}`}
              aria-pressed={on}
              onClick={() => onSpeed(p.value)}
            >
              <span className="preset__name">
                {on && <CheckIcon size={26} stroke="#1F4FB8" />}
                {p.name}
              </span>
              <span className="preset__sub">{p.sub}</span>
            </button>
          )
        })}
      </div>

      <div className="speed-extra">
        <div className="fine" role="group" aria-labelledby="fine-title">
          <div className="fine__title" id="fine-title">조금씩 바꾸기</div>
          <div className="fine__row">
            {/* 결정 33: 기호만 두지 않고 글자도 함께. 이름은 와이어프레임 aria-label (보이는 글자를 포함) */}
            <button
              type="button"
              className="fine__btn"
              aria-label="조금 느리게"
              disabled={!canSlower(speed)}
              onClick={() => onSpeed(normalizeSpeed(speed - SPEED_STEP))}
            >
              <span className="fine__sign" aria-hidden="true">−</span>
              <span>느리게</span>
            </button>
            <div className="fine__value" aria-live="polite">{formatRate(speed)}</div>
            <button
              type="button"
              className="fine__btn"
              aria-label="조금 빠르게"
              disabled={!canFaster(speed)}
              onClick={() => onSpeed(normalizeSpeed(speed + SPEED_STEP))}
            >
              <span className="fine__sign" aria-hidden="true">+</span>
              <span>빠르게</span>
            </button>
          </div>
        </div>
        <label className="pitch">
          <input type="checkbox" checked={keepPitch} onChange={(e) => onKeepPitch(e.target.checked)} />
          <span className="pitch__text">
            <span className="pitch__name">목소리 높낮이는 그대로 두기 (추천)</span>
            <span className="pitch__sub">끄면 빨라질 때 목소리가 높아져요</span>
          </span>
        </label>
      </div>
    </>
  )
}
