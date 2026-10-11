"""POST /tracks (CONTRACT 2-1)."""
from fastapi import APIRouter

from .. import queue, store
from ..schemas import TrackRequest
from ..youtube import normalize_url

router = APIRouter()


@router.post("/tracks", status_code=202)
def create_track(body: TrackRequest) -> dict:
    url = normalize_url(body.url)
    job = store.create_job("extract")
    track = store.create_track(job["jobId"], url)
    queue.send(queue.EXTRACT_TASK, job["jobId"], track["trackId"])
    return {"jobId": job["jobId"], "trackId": track["trackId"]}
