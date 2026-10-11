"""FastAPI 앱 (PLAN 8장, CONTRACT 2장)."""
from fastapi import FastAPI

from . import errors
from .routers import tracks

app = FastAPI(title="쉬운 음악 만들기 API")
errors.install(app)
app.include_router(tracks.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
