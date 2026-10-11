"""GET /jobs/{id} (CONTRACT 2-2)."""
from fastapi import APIRouter

from .. import store
from ..errors import ApiError

router = APIRouter()


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = store.get_job(job_id)
    if job is None:
        raise ApiError("NOT_FOUND")
    return job
