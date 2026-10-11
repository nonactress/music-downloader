// 카드 [위로] [아래로] [빼기] — 결정 38
import type { EditJson } from '../api/types'

export function moveTrack(edit: EditJson, from: number, to: number): EditJson {
  if (to < 0 || to >= edit.tracks.length || from === to) return edit
  const tracks = [...edit.tracks]
  const [t] = tracks.splice(from, 1)
  tracks.splice(to, 0, t)
  return { ...edit, tracks }
}

export function removeTrack(edit: EditJson, index: number): EditJson {
  if (edit.tracks.length <= 1) return edit
  return { ...edit, tracks: edit.tracks.filter((_, i) => i !== index) }
}
