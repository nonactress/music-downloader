// ① 노래 가져오기 — docs/wireframes/html/Main.html
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import { ErrorBox } from '../components/ErrorBox'
import { HOWTO_PICTURES } from '../components/HowtoPictures'
import { PasteIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { checkYoutubeUrl } from '../lib/youtubeUrl'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

const PASTE_FAILED = '붙여넣기가 안 됐어요. 입력칸을 누르고 Ctrl 키와 V 키를 함께 눌러주세요.'

const HOWTO = ['유튜브에서 노래 영상을 열어요', '맨 위 주소창을 한 번 눌러요', '마우스 오른쪽 → [복사]']

export function ImportPage() {
  const lastUrl = useFlowStore((s) => s.lastUrl)
  const startLoading = useFlowStore((s) => s.startLoading)
  const [url, setUrl] = useState(lastUrl)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text.trim())
      setError(null)
    } catch {
      setError(PASTE_FAILED)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const invalid = checkYoutubeUrl(url)
    if (invalid) {
      setError(invalid.message)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { jobId } = await api.createTrack(url.trim())
      useEditStore.getState().reset()
      startLoading(jobId, url.trim())
    } catch (err) {
      setError(toUserMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Page step={1}>
      <main className="import">
        <div className="import__title">
          <h1 className="h1">유튜브 주소를 넣어주세요</h1>
          <p className="lead">주소를 넣고 [노래 불러오기]를 누르면 노래를 가져와요.</p>
        </div>

        <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
          <div className="import__field">
            <label htmlFor="url" className="import__label">유튜브 주소</label>
            <div className="import__row">
              <input
                id="url"
                className="import__input"
                placeholder="여기를 눌러 주소를 넣으세요"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setError(null)
                }}
                inputMode="url"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'url-error' : undefined}
              />
              <button type="button" className="btn-outline import__paste" onClick={paste}>
                <PasteIcon />
                붙여넣기
              </button>
            </div>
          </div>

          {error && (
            <div id="url-error">
              <ErrorBox message={error} />
            </div>
          )}

          <button type="submit" className="btn-primary import__submit" disabled={submitting}>
            노래 불러오기
          </button>
        </form>

        <section className="howto">
          <h2 className="howto__title">유튜브 주소는 어디서 찾나요?</h2>
          <ol className="howto__grid">
            {HOWTO.map((text, i) => (
              <li key={text} className="howto__item">
                <div className="howto__pic">{HOWTO_PICTURES[i]()}</div>
                <div className="howto__text"><b>{i + 1}.</b> {text}</div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </Page>
  )
}
