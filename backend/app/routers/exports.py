"""POST /exports, GET /exports/{id}/download (CONTRACT 2-5, 2-6)."""
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from .. import config, queue, store
from ..errors import ApiError
from ..ffmpeg_builder import TrackEdit, validate
from ..ratelimit import limit_per_ip
from ..schemas import EditJson

router = APIRouter()

DURATION_TOLERANCE_SEC = 0.05
MIN_KEEP_SEC = 1.0


def _check_edit(edit: EditJson) -> None:
    """CONTRACT 3-2. 스키마(pydantic)로 못 거르는 규칙과 원곡 길이 검사."""
    for i, t in enumerate(edit.tracks):
        if t.end - t.start < MIN_KEEP_SEC:
            raise ApiError("INVALID_EDIT", f"tracks.{i}: end - start < {MIN_KEEP_SEC}")

    for i, t in enumerate(edit.tracks):
        track = store.get_track(t.source_id)
        if track is None or track.get("status") == "failed":
            raise ApiError("NOT_FOUND", f"tracks.{i}.sourceId: {t.source_id}")
        if track.get("status") != "done":
            raise ApiError("NOT_READY", f"tracks.{i}.sourceId: {t.source_id}")
        if not config.track_audio_path(t.source_id).exists():
            raise ApiError("NOT_FOUND", f"tracks.{i}.sourceId: 파일 없음")
        if t.end > track["durationSec"] + DURATION_TOLERANCE_SEC:
            raise ApiError("INVALID_EDIT", f"tracks.{i}: end > durationSec({track['durationSec']})")

    try:
        validate(
            [TrackEdit(t.start, t.end, t.speed, t.keep_pitch) for t in edit.tracks],
            edit.crossfade,
        )
    except ValueError as e:
        raise ApiError("INVALID_EDIT", str(e))


@router.post("/exports", status_code=202, dependencies=[Depends(limit_per_ip)])
def create_export(edit: EditJson) -> dict:
    _check_edit(edit)
    job = store.create_job("export")
    exp = store.create_export(job["jobId"])
    queue.send(queue.EXPORT_TASK, job["jobId"], exp["exportId"], edit.model_dump(by_alias=True))
    return {"jobId": job["jobId"], "exportId": exp["exportId"]}


@router.get("/exports/{export_id}/download")
def download_export(export_id: str) -> FileResponse:
    exp = store.get_export(export_id)
    if exp is None or exp.get("status") == "failed":
        raise ApiError("NOT_FOUND")
    if exp.get("status") != "done":
        raise ApiError("NOT_READY")
    path = config.export_path(export_id)
    if not path.exists():
        raise ApiError("NOT_FOUND")
    disposition = f"attachment; filename=\"export.mp3\"; filename*=UTF-8''{quote(exp['fileName'])}"
    return FileResponse(
        path,
        media_type="audio/mpeg",
        headers={"Content-Disposition": disposition, "Accept-Ranges": "bytes"},
    )
