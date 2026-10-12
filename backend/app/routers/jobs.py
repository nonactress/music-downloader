"""GET /jobs/{id} (CONTRACT 2-2). 만든 사람만 (결정 57)."""
from fastapi import APIRouter, Depends

from .. import store
from ..errors import ApiError
from .auth import current_user

router = APIRouter()


@router.get("/jobs/{job_id}")
def get_job(job_id: str, login_id: str = Depends(current_user)) -> dict:
    job = store.owned(store.get_job(job_id), login_id)
    if job is None:
        raise ApiError("NOT_FOUND")
    return {k: v for k, v in job.items() if k != "owner"}
