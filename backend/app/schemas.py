"""요청 모양 (CONTRACT 2장, 3장). 필드 이름은 camelCase alias로 맞춘다."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Model(BaseModel):
    # 모르는 필드는 무시 (CONTRACT 0장)
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class TrackRequest(_Model):
    url: str


class TrackEditIn(_Model):
    source_id: str = Field(min_length=1, max_length=64)
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    speed: float = Field(ge=0.5, le=2.0)
    keep_pitch: bool


class EditJson(_Model):
    tracks: list[TrackEditIn] = Field(min_length=1)
    crossfade: float = Field(ge=0, le=10)
    normalize: bool
    format: Literal["mp3"]
