// ⑦ 저장 완료 — docs/wireframes/html/Done.html
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { CheckIcon, DownloadIcon, MusicIcon, PauseIcon, PlayIcon } from '../components/Icons'
import { Page } from '../components/Page'
import { formatFileSize, formatKoreanDuration } from '../lib/format'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function DonePage() {
  const result = useFlowStore((s) => s.exportResult)
  const goImport = useFlowStore((s) => s.goImport)
  const goEdit = useFlowStore((s) => s.goEdit)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

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

  function startNew() {
    useEditStore.getState().reset()
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
          />
        </div>

        <a className="btn-primary done__save" href={downloadUrl} download={result.fileName}>
          <DownloadIcon />
          내 컴퓨터에 저장하기
        </a>

        {/* 안내 내용은 5단계 전까지 자리표시 (PLAN 결정 13) */}
        <a href="#" className="done__help" onClick={(e) => e.preventDefault()}>
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
