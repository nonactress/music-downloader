// 변경 알림 "…바꿨어요 [되돌리기]" — docs/wireframes/html/Edit.html
import type { Change } from '../store/editStore'
import { CheckIcon } from './Icons'

export function ChangeNotice({ change, onUndo }: { change: Change; onUndo: () => void }) {
  return (
    <div role="status" className="change-notice">
      <div className="change-notice__text">
        <CheckIcon size={24} stroke="#1F4FB8" />
        <span>
          {change.prefix}
          {change.emphasis && <b>{change.emphasis}</b>}
          {change.suffix}
        </span>
      </div>
      <button type="button" className="change-notice__undo" onClick={onUndo}>되돌리기</button>
    </div>
  )
}
