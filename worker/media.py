"""ffmpeg / ffprobe 호출. subprocess는 인자 리스트로만 실행한다 (shell=True 금지)."""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import numpy as np

from app import config

PEAKS_DECODE_RATE = 8000  # 파형 계산용 디코딩 샘플레이트 (화면 표시에는 충분)


class MediaError(Exception):
    pass


def _run(args: list[str], *, capture_stdout: bool = False) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            args,
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE if capture_stdout else subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as e:
        tail = (e.stderr or b"")[-500:].decode("utf-8", "replace")
        raise MediaError(f"{args[0]} 실패 (exit {e.returncode}): {tail}") from e


def convert_to_mp3(src: Path, dst: Path, bitrate: str = "192k") -> None:
    """원본 오디오 → 44.1kHz 스테레오 mp3 (PLAN 10장: 모든 소스 통일)."""
    _run([
        "ffmpeg", "-hide_banner", "-nostdin", "-y",
        "-i", str(src),
        "-vn", "-map_metadata", "-1",
        "-ar", str(config.SAMPLE_RATE), "-ac", "2",
        "-c:a", "libmp3lame", "-b:a", bitrate,
        "-f", "mp3", str(dst),
    ])


def probe_duration(path: Path) -> float:
    out = _run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ], capture_stdout=True).stdout.decode().strip()
    try:
        return round(float(out), 3)
    except ValueError as e:
        raise MediaError(f"ffprobe 길이를 읽지 못함: {out!r}") from e


def peaks_from_samples(samples: np.ndarray, rate: int, duration: float,
                       points_per_second: int) -> list[float]:
    """모노 int16 샘플 → 구간별 절댓값 최댓값(0~1). 길이 = ceil(duration × pps)."""
    n = math.ceil(duration * points_per_second)
    if n <= 0:
        return []
    per_point = rate / points_per_second
    data = np.abs(samples.astype(np.float32)) / 32768.0
    peaks = []
    for i in range(n):
        a = int(i * per_point)
        b = max(int((i + 1) * per_point), a + 1)
        chunk = data[a:b]
        peaks.append(round(float(chunk.max()), 3) if chunk.size else 0.0)
    return [min(p, 1.0) for p in peaks]


def compute_peaks(path: Path, duration: float,
                  points_per_second: int = config.PEAKS_PER_SECOND) -> list[float]:
    raw = _run([
        "ffmpeg", "-hide_banner", "-nostdin", "-v", "error",
        "-i", str(path),
        "-ac", "1", "-ar", str(PEAKS_DECODE_RATE),
        "-f", "s16le", "-",
    ], capture_stdout=True).stdout
    samples = np.frombuffer(raw, dtype=np.int16)
    return peaks_from_samples(samples, PEAKS_DECODE_RATE, duration, points_per_second)


def write_peaks(path: Path, track_id: str, duration: float, peaks: list[float]) -> None:
    data = {
        "trackId": track_id,
        "durationSec": duration,
        "pointsPerSecond": config.PEAKS_PER_SECOND,
        "peaks": peaks,
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")))
    tmp.replace(path)
