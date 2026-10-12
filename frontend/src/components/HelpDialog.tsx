// 도움말 창 — 큰 글씨, 뒤 화면 어둡게, [닫기] · Esc, 포커스는 창 안에만 (결정 47)
// <dialog>.showModal(): 뒤 화면은 inert(누를 수도 Tab으로 갈 수도 없음) + Esc로 닫힘
import { useEffect, useRef } from 'react'
import { HELP, splitBold } from '../lib/help'
import { useUiStore } from '../store/uiStore'

export function HelpDialog() {
  const help = useUiStore((s) => s.help)
  const closeHelp = useUiStore((s) => s.closeHelp)
  const ref = useRef<HTMLDialogElement>(null)
  /** 창을 열기 전 버튼 — 닫으면 그리로 돌아간다 */
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (help && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null
      dialog.showModal()
    } else if (!help && dialog.open) {
      dialog.close()
    }
  }, [help])

  const text = help ? HELP[help] : null

  return (
    <dialog
      ref={ref}
      className="help"
      aria-labelledby="help-title"
      // Esc도 여기로 온다
      onClose={() => {
        closeHelp()
        opener.current?.focus()
        opener.current = null
      }}
      // Tab이 브라우저 주소창으로 빠져나가지 않게 창 안에서 돈다
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'))
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }}
      // 어두운 바깥을 눌러도 닫기
      onClick={(e) => {
        if (e.target === e.currentTarget) closeHelp()
      }}
    >
      {text && (
        <div className="help__body">
          <h2 id="help-title" className="help__title">{text.title}</h2>
          <ol className="help__steps">
            {text.steps.map((step, i) => (
              <li key={i} className="help__step">
                <span className="help__num" aria-hidden="true">{i + 1}.</span>
                <span>
                  {splitBold(step).map((p, j) => (p.bold ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}
                </span>
              </li>
            ))}
          </ol>
          {text.note && <p className="help__note">{text.note}</p>}
          <button type="button" className="btn-primary help__close" onClick={closeHelp} autoFocus>
            닫기
          </button>
        </div>
      )}
    </dialog>
  )
}
