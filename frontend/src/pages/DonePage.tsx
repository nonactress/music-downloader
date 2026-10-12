// ⑦ 저장 완료 — docs/wireframes/html/Done.html
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { api } from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'
import type { SaveExportResponse } from '../api/types'
import { ErrorBox } from '../components/ErrorBox'
import { CheckIcon, DownloadIcon, MusicIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { formatFileSize, formatKoreanDuration } from '../lib/format'
import { checkSession, useAuthStore } from '../store/authStore'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'
import { clearSession } from '../store/persist'
import { useUiStore } from '../store/uiStore'

export function DonePage() {
  const result = useFlowStore((s) => s.exportResult)
  const goImport = useFlowStore((s) => s.goImport)
  const goEdit = useFlowStore((s) => s.goEdit)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const saveRef = useRef<HTMLAnchorElement>(null)
  /** 확인을 마치고 다시 누른 클릭은 그대로 내려받기 */
  const checked = useRef(false)
  /** 윈도우 프로그램: 링크 다운로드 대신 다운로드 폴더에 바로 저장 (결정 71) */
  const desktop = useAuthStore((s) => s.desktop)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<(SaveExportResponse & { canReveal: boolean }) | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!result) goImport()
  }, [result, goImport])
  if (!result) return null

  const downloadUrl = api.downloadUrl(result.exportId)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }

  // 다운로드 링크가 401이면 화면이 알 수 없으니 누르기 직전에 로그인 확인 (결정 60)
  async function save(e: MouseEvent<HTMLAnchorElement>) {
    if (checked.current) {
      checked.current = false
      return
    }
    e.preventDefault()
    if (!(await checkSession())) return
    checked.current = true
    saveRef.current?.click()
  }

  // 다시 누르면 한 벌 더 저장 (서버가 "(2)"를 붙임). 401은 client가 다시 켜기 안내로 (결정 70)
  async function saveToDownloads() {
    if (saving || !result) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api.saveExport(result.exportId)
      setSaved({ ...res, canReveal: true })
    } catch (e) {
      setSaveError(toUserMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // 프로그램을 다시 켜서 기록이 없으면 404 → 버튼만 숨김 (CONTRACT 7-4)
  async function reveal() {
    if (!saved) return
    setSaveError(null)
    try {
      await api.revealSaved(saved.savedId)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setSaved({ ...saved, canReveal: false })
      else setSaveError(toUserMessage(e))
    }
  }

  function startNew() {
    useEditStore.getState().reset()
    useFlowStore.setState({ startedAt: null })
    clearSession()
    useFlowStore.setState({ lastUrl: '' })
    goImport()
  }

  return (
    <Page step={3}>
      <main className="done">
        <div className="done__badge">
          <CheckIcon size={64} stroke="#1F4FB8" width={2.5} />
        </div>
        <div className="done__title">
          <h1 className="h1">노래가 완성됐어요!</h1>
          <p className="lead">아래 큰 버튼을 누르면 내 컴퓨터에 저장돼요.</p>
        </div>

        <div className="file-card">
          <div className="file-card__icon">
            <MusicIcon />
          </div>
          <div className="file-card__info">
            <div className="file-card__name">{result.fileName}</div>
            <div className="file-card__sub">
              노래 {result.trackCount}곡 · {formatKoreanDuration(result.durationSec)} · {formatFileSize(result.sizeBytes)}
            </div>
          </div>
          <button type="button" className="btn-outline file-card__play" onClick={togglePlay} aria-pressed={playing}>
            {playing ? <PauseIcon /> : <PlayIcon />}
            {playing ? '멈추기' : '들어보기'}
          </button>
          <audio
            ref={audioRef}
            src={downloadUrl}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            // 세션이 끝나 401로 막혔을 수 있다 → 로그인 화면 (결정 60)
            onError={() => {
              setPlaying(false)
              void checkSession()
            }}
          />
        </div>

        {desktop ? (
          <button type="button" className="btn-primary done__save" onClick={saveToDownloads} disabled={saving}>
            <DownloadIcon />
            내 컴퓨터에 저장하기
          </button>
        ) : (
          <a ref={saveRef} className="btn-primary done__save" href={downloadUrl} download={result.fileName} onClick={save}>
            <DownloadIcon />
            내 컴퓨터에 저장하기
          </a>
        )}

        {saved && (
          <div className="done__saved">
            <p role="status" className="done__saved-text">
              다운로드 폴더에 「<b>{saved.fileName}</b>」로 저장했어요.
            </p>
            {saved.canReveal && (
              <button type="button" className="btn-outline done__reveal" onClick={reveal}>
                저장한 곳 열기
              </button>
            )}
          </div>
        )}
        {saveError && <ErrorBox message={saveError} className="done__error" />}

        {/* 도움말과 같은 창 (결정 47). 와이어프레임의 링크 모양 그대로 */}
        <a
          href="#"
          className="done__help"
          aria-haspopup="dialog"
          onClick={(e) => {
            e.preventDefault()
            useUiStore.getState().openHelp(desktop ? 'findSavedDesktop' : 'findSaved')
          }}
        >
          저장한 노래는 어디서 찾나요?
        </a>

        <div className="done__more">
          <button type="button" className="btn-outline" onClick={goEdit}>다시 고치러 가기</button>
          <button type="button" className="btn-outline" onClick={startNew}>새 노래 만들기</button>
        </div>
      </main>
    </Page>
  )
}
