"""POST /tracks, GET /tracks/{id}/audio, GET /tracks/{id}/peaks (CONTRACT 2-1, 2-3, 2-4)."""
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, Response

from .. import config, queue, store
from ..errors import ApiError
from ..ratelimit import limit_per_ip, take_daily_track
from ..schemas import TrackRequest
from ..youtube import normalize_url
from .auth import current_user

router = APIRouter()


@router.post("/tracks", status_code=202, dependencies=[Depends(limit_per_ip)])
def create_track(body: TrackRequest, request: Request, login_id: str = Depends(current_user)) -> dict:
    url = normalize_url(body.url)
    take_daily_track(request)  # 주소가 맞을 때만 하루 한도에서 하나 씀
    job = store.create_job("extract", owner=login_id)
    track = store.create_track(job["jobId"], url, owner=login_id)
    queue.send(queue.EXTRACT_TASK, job["jobId"], track["trackId"])
    return {"jobId": job["jobId"], "trackId": track["trackId"]}


def _ready_file(track_id: str, path: Path, login_id: str) -> Path:
    """없음/남의 것/실패/지워짐 → 404, 추출 중 → 409. 경로는 저장소에 있는 id로만 만든다."""
    track = store.owned(store.get_track(track_id), login_id)
    if track is None or track.get("status") == "failed":
        raise ApiError("NOT_FOUND")
    if track.get("status") != "done":
        raise ApiError("NOT_READY")
    if not path.exists():
        raise ApiError("NOT_FOUND")
    return path


@router.get("/tracks/{track_id}/audio")
def track_audio(track_id: str, login_id: str = Depends(current_user)) -> FileResponse:
    path = _ready_file(track_id, config.track_audio_path(track_id), login_id)
    return FileResponse(path, media_type="audio/mpeg", headers={"Accept-Ranges": "bytes"})


@router.get("/tracks/{track_id}/peaks")
def track_peaks(track_id: str, login_id: str = Depends(current_user)) -> Response:
    path = _ready_file(track_id, config.track_peaks_path(track_id), login_id)
    # 파일은 worker가 CONTRACT 2-4 모양 그대로 써 둔 것 → 다시 파싱하지 않고 보낸다
    return Response(path.read_bytes(), media_type="application/json")
