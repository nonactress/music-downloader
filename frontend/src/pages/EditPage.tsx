// ③ 편집 홈 — docs/wireframes/html/Edit.html
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { toUserMessage } from '../api/errors'
import { ErrorBox } from '../components/ErrorBox'
import { Page } from '../components/Page'
import { useEditStore } from '../store/editStore'
import { useFlowStore } from '../store/flowStore'

export function EditPage() {
  const edit = useEditStore((s) => s.edit)
  const goImport = useFlowStore((s) => s.goImport)
  const startSaving = useFlowStore((s) => s.startSaving)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (edit.tracks.length === 0) goImport()
  }, [edit.tracks.length, goImport])

  async function save() {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const { jobId } = await api.createExport(useEditStore.getState().edit)
      startSaving(jobId)
    } catch (e) {
      setSaveError(toUserMessage(e))
      setSaving(false)
    }
  }

  return (
    <Page step={2} minHeight={1240}>
      <main className="edit">
        <div className="edit__title">
          <h1 className="edit__h1">노래를 다듬어 주세요</h1>
        </div>

        {saveError && <ErrorBox message={saveError} />}

        <div className="edit__footer">
          <div />
          <button type="button" className="edit__save" onClick={save} disabled={saving}>
            다 됐어요, 저장하기
          </button>
        </div>
      </main>
    </Page>
  )
}
