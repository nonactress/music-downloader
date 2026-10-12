"""ffmpeg / ffprobe 호출. subprocess는 인자 리스트로만 실행한다 (shell=True 금지)."""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
from pathlib import Path

import numpy as np

from app import config

PEAKS_DECODE_RATE = 8000  # 파형 계산용 디코딩 샘플레이트 (화면 표시에는 충분)


class MediaError(Exception):
    pass


def popen_flags() -> dict:
    """윈도우에서 ffmpeg · yt-dlp 콘솔 창이 깜빡이지 않게 (결정 73). 다른 OS는 없음."""
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NO_WINDOW}
    return {}


def _run(args: list[str], *, capture_stdout: bool = False) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            args,
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE if capture_stdout else subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            **popen_flags(),
        )
    except subprocess.CalledProcessError as e:
        tail = (e.stderr or b"")[-500:].decode("utf-8", "replace")
        raise MediaError(f"{args[0]} 실패 (exit {e.returncode}): {tail}") from e


def convert_to_mp3(src: Path, dst: Path, bitrate: str = "192k") -> None:
    """원본 오디오 → 44.1kHz 스테레오 mp3 (PLAN 10장: 모든 소스 통일)."""
    _run([
        config.FFMPEG_BIN, "-hide_banner", "-nostdin", "-y",
        "-i", str(src),
        "-vn", "-map_metadata", "-1",
        "-ar", str(config.SAMPLE_RATE), "-ac", "2",
        "-c:a", "libmp3lame", "-b:a", bitrate,
        "-f", "mp3", str(dst),
    ])


def probe_duration(path: Path) -> float:
    out = _run([
        config.FFPROBE_BIN, "-v", "error",
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
        config.FFMPEG_BIN, "-hide_banner", "-nostdin", "-v", "error",
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


_LOUDNESS_RE = re.compile(r"^\s*I:\s*(-?[\d.]+|-inf)\s*LUFS", re.MULTILINE)
_PEAK_RE = re.compile(r"^\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS", re.MULTILINE)
SILENCE_LUFS = -70.0


def measure_loudness(path: Path, start: float, end: float) -> tuple[float, float]:
    """남길 구간의 소리 크기(통합 LUFS)와 최대값(true peak dBFS). ebur128 — 길이에 비례해 빠름."""
    err = _run([
        config.FFMPEG_BIN, "-hide_banner", "-nostdin", "-nostats", "-v", "info",
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(path),
        "-af", "ebur128=peak=true:framelog=quiet",
        "-f", "null", "-",
    ]).stderr.decode("utf-8", "replace")
    loud, peak = _LOUDNESS_RE.findall(err), _PEAK_RE.findall(err)
    if not loud or not peak:
        raise MediaError(f"ebur128 결과를 읽지 못함: {err[-300:]!r}")

    def _f(v: str) -> float:
        return SILENCE_LUFS if v == "-inf" else float(v)
    return _f(loud[-1]), _f(peak[-1])
