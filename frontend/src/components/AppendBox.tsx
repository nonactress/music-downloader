// "노래 하나 더 붙이기" 점선 상자 — docs/wireframes/html/Edit.html
// 주소 검사는 ①과 같은 함수, 불러오는 동안은 ② 화면 재사용 (결정 36), 20곡이면 비활성 (결정 37)
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import { checkYoutubeUrl } from '../lib/youtubeUrl'
import { MAX_TRACKS } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'
import { ErrorBox } from './ErrorBox'

export function AppendBox({ count, onStart }: { count: number; onStart: () => void }) {
  const appendUrl = useFlowStore((s) => s.appendUrl)
  const startAppending = useFlowStore((s) => s.startAppending)
  const [url, setUrl] = useState(appendUrl)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const full = count >= MAX_TRACKS

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting || full) return
    const invalid = checkYoutubeUrl(url)
    if (invalid) {
      setError(invalid.message)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { jobId } = await api.createTrack(url.trim())
      onStart()
      startAppending(jobId, url.trim())
    } catch (err) {
      setError(toUserMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <form className="append" onSubmit={submit} noValidate>
      <label htmlFor="add-url" className="append__label">노래 하나 더 붙이기</label>
      <div className="append__row">
        <input
          id="add-url"
          className="append__input"
          placeholder="다른 유튜브 주소를 넣으세요"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          inputMode="url"
          autoComplete="off"
          disabled={full}
          aria-invalid={error ? true : undefined}
          aria-describedby={full ? 'add-full' : error ? 'add-error' : undefined}
        />
        <button type="submit" className="btn-outline append__btn" disabled={full || submitting}>
          불러와서 붙이기
        </button>
      </div>
      {full && <p id="add-full" className="append__full">노래는 {MAX_TRACKS}곡까지 붙일 수 있어요</p>}
      {error && (
        <div id="add-error">
          <ErrorBox message={error} />
        </div>
      )}
    </form>
  )
}
