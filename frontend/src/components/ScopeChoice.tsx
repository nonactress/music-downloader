// "어디에 적용할까요?" [이 노래만] / [모든 노래] — 고르면 그 화면으로 간다 (결정 31)
interface Props {
  value: 'one' | 'all'
  allLabel: string
  onOne: () => void
  onAll: () => void
}

export function ScopeChoice({ value, allLabel, onOne, onAll }: Props) {
  const option = (key: 'one' | 'all', label: string, onPick: () => void) => {
    const on = value === key
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        className={`scope__option${on ? ' scope__option--on' : ''}`}
        onClick={on ? undefined : onPick}
      >
        <span className="scope__dot" aria-hidden="true" />
        <span className="scope__label">{label}</span>
      </button>
    )
  }
  return (
    <fieldset className="scope">
      <legend className="scope__legend">어디에 적용할까요?</legend>
      <div className="scope__grid" role="radiogroup" aria-label="어디에 적용할까요?">
        {option('one', '이 노래만', onOne)}
        {option('all', allLabel, onAll)}
      </div>
    </fieldset>
  )
}
