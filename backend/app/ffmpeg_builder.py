"""Edit JSON → ffmpeg filter_complex / 명령어 인자 생성 (PLAN.md 10장).

처리 순서: 자르기(atrim) → 빠르기(atempo | asetrate) → 소리 크기(volume) → 잇기(acrossfade | concat).
모든 소스는 추출 단계에서 44.1kHz 스테레오로 통일되어 있다고 가정한다.

소리 크기 맞추기는 2단계: worker가 곡마다 ebur128로 소리 크기(I) · 최대값(peak)을 먼저 재고
(`normalize_gain_db`), 렌더링에서는 곡마다 고정 음량 `volume=<gain>dB`만 건다.
한 번에 처리하는 loudnorm(동적 모드)은 20분 × 20곡에서 실시간의 약 30배 속도라
렌더링 타임아웃(600초)을 넘는다 (B10 측정).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

SAMPLE_RATE = 44100
# 소리 크기 목표 (loudnorm=I=-16:TP=-1.5와 같은 값)
TARGET_LUFS = -16.0
TARGET_PEAK_DB = -1.5
MAX_GAIN_DB = 20.0  # 거의 무음인 곡을 터무니없이 키우지 않게
LOUDNORM = f"loudnorm=I={TARGET_LUFS:g}:TP={TARGET_PEAK_DB:g}:LRA=11"  # 측정값이 없을 때만
# atempo 필터 하나가 받을 수 있는 범위
ATEMPO_MIN = 0.5
ATEMPO_MAX = 2.0


class TrackLike(Protocol):
    start: float
    end: float
    speed: float
    keep_pitch: bool


@dataclass(frozen=True)
class TrackEdit:
    start: float
    end: float
    speed: float = 1.0
    keep_pitch: bool = True


def _num(x: float) -> str:
    """12.0 → '12', 12.5 → '12.5' (불필요한 소수점 제거)."""
    return f"{float(x):.6f}".rstrip("0").rstrip(".")


def output_duration(t: TrackLike) -> float:
    """자르기 · 빠르기를 적용한 뒤의 곡 길이(초)."""
    return (t.end - t.start) / t.speed


def _atempo_chain(speed: float) -> list[str]:
    """atempo는 0.5~2.0만 받으므로 범위 밖이면 여러 개로 나눈다."""
    chain = []
    s = speed
    while s > ATEMPO_MAX:
        chain.append(f"atempo={_num(ATEMPO_MAX)}")
        s /= ATEMPO_MAX
    while s < ATEMPO_MIN:
        chain.append(f"atempo={_num(ATEMPO_MIN)}")
        s /= ATEMPO_MIN
    chain.append(f"atempo={_num(s)}")
    return chain


def normalize_gain_db(integrated_lufs: float, peak_db: float) -> float:
    """목표 소리 크기까지의 음량 변화(dB). 최대값이 TARGET_PEAK_DB를 넘지 않는 만큼만 키운다."""
    gain = min(TARGET_LUFS - integrated_lufs, TARGET_PEAK_DB - peak_db)
    return max(-MAX_GAIN_DB, min(MAX_GAIN_DB, gain))


def validate(tracks: Sequence[TrackLike], crossfade: float) -> None:
    if not tracks:
        raise ValueError("노래가 하나 이상 있어야 합니다")
    if crossfade < 0:
        raise ValueError("crossfade는 0 이상이어야 합니다")
    for i, t in enumerate(tracks):
        if t.start < 0 or t.end <= t.start:
            raise ValueError(f"{i}번 노래의 start/end가 잘못되었습니다")
        if t.speed <= 0:
            raise ValueError(f"{i}번 노래의 speed가 잘못되었습니다")
    if len(tracks) > 1 and crossfade > 0:
        for i, t in enumerate(tracks):
            if output_duration(t) <= crossfade:
                raise ValueError(f"{i}번 노래가 부드럽게 잇기 길이보다 짧습니다")


def build_filter(tracks: Sequence[TrackLike], crossfade: float, normalize: bool,
                 gains_db: Sequence[float] | None = None) -> str:
    """gains_db: 곡별 소리 크기 맞추기 음량(dB, normalize_gain_db). 없으면 loudnorm 한 번 처리."""
    validate(tracks, crossfade)
    if gains_db is not None and len(gains_db) != len(tracks):
        raise ValueError("gains_db 수와 노래 수가 다릅니다")
    parts = []
    for i, t in enumerate(tracks):
        f = [f"atrim=start={_num(t.start)}:end={_num(t.end)}", "asetpts=PTS-STARTPTS"]
        if t.speed != 1.0:
            if t.keep_pitch:
                f.extend(_atempo_chain(t.speed))
            else:
                f.append(f"asetrate={_num(SAMPLE_RATE * t.speed)},aresample={SAMPLE_RATE}")
        if normalize:
            f.append(f"volume={gains_db[i]:.2f}dB" if gains_db is not None else LOUDNORM)
        parts.append(f"[{i}:a]{','.join(f)}[a{i}]")

    # 이어 붙이기
    if len(tracks) == 1:
        parts.append("[a0]anull[out]")
    elif crossfade > 0:
        prev = "a0"
        for i in range(1, len(tracks)):
            out = "out" if i == len(tracks) - 1 else f"x{i}"
            parts.append(f"[{prev}][a{i}]acrossfade=d={_num(crossfade)}[{out}]")
            prev = out
    else:
        ins = "".join(f"[a{i}]" for i in range(len(tracks)))
        parts.append(f"{ins}concat=n={len(tracks)}:v=0:a=1[out]")
    return ";".join(parts)


def total_duration(tracks: Sequence[TrackLike], crossfade: float) -> float:
    """결과 파일 길이(초). 크로스페이드마다 겹치는 만큼 줄어든다."""
    total = sum(output_duration(t) for t in tracks)
    if len(tracks) > 1 and crossfade > 0:
        total -= crossfade * (len(tracks) - 1)
    return total


def build_command(
    input_paths: Sequence[str],
    tracks: Sequence[TrackLike],
    crossfade: float,
    normalize: bool,
    output_path: str,
    bitrate: str = "192k",
    gains_db: Sequence[float] | None = None,
) -> list[str]:
    """subprocess.run에 그대로 넘길 인자 리스트 (shell=True 금지)."""
    if len(input_paths) != len(tracks):
        raise ValueError("입력 파일 수와 노래 수가 다릅니다")
    from . import config  # 데스크톱은 함께 넣은 ffmpeg.exe 경로 (결정 73)

    args = [config.FFMPEG_BIN, "-hide_banner", "-nostdin", "-y"]
    for p in input_paths:
        args += ["-i", str(p)]
    args += [
        "-filter_complex", build_filter(tracks, crossfade, normalize, gains_db),
        "-map", "[out]",
        "-ar", str(SAMPLE_RATE), "-ac", "2",
        "-c:a", "libmp3lame", "-b:a", bitrate,
        str(output_path),
    ]
    return args
