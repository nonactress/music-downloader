"""데스크톱 추출: yt-dlp 실행 파일 subprocess (B32, 결정 73).

진짜 yt-dlp 대신 같은 인자를 받아 같은 모양으로 출력하는 가짜 실행 파일로 시험한다.
"""
import json
import os
import stat
import sys
import textwrap

import pytest

from app import config, store
from worker import ytdlp_cli
from worker.tasks import extract
from worker.tests.conftest import make_tone, needs_ffmpeg

pytestmark = pytest.mark.skipif(os.name == "nt", reason="가짜 실행 파일은 shebang 스크립트")

FAKE = textwrap.dedent('''\
    #!{python}
    import json, os, shutil, sys, time
    args = sys.argv[1:]
    log = os.environ["FAKE_LOG"]
    with open(log, "a") as f:
        f.write(json.dumps(args) + "\\n")
    mode = os.environ.get("FAKE_MODE", "ok")
    if "-U" in args:
        print("yt-dlp is up to date"); sys.exit(0)
    if "--dump-single-json" in args:
        if mode == "unavailable":
            print("ERROR: [youtube] x: Video unavailable", file=sys.stderr); sys.exit(1)
        if mode == "bot":
            print("ERROR: [youtube] x: Sign in to confirm you're not a bot", file=sys.stderr); sys.exit(1)
        if mode == "hang_info":
            time.sleep(30)
        print(json.dumps(json.loads(os.environ["FAKE_INFO"]))); sys.exit(0)
    # 받기
    out = args[args.index("-o") + 1].replace("%(ext)s", "webm")
    total = int(os.environ.get("FAKE_TOTAL", "1000"))
    for done in (100, 500, total):
        print(f"EMPROG downloading {{done}} {{total}} NA 3", flush=True)
    if mode == "hang_dl":
        time.sleep(30)
    if mode == "dl_error":
        print("ERROR: unable to download video data: HTTP Error 403", file=sys.stderr); sys.exit(1)
    shutil.copy(os.environ["FAKE_SOURCE"], out)
    print(f"EMPROG finished {{total}} {{total}} NA NA", flush=True)
''')


@pytest.fixture
def fake(tmp_path, monkeypatch):
    exe = tmp_path / "bin" / "yt-dlp"
    exe.parent.mkdir()
    exe.write_text(FAKE.format(python=sys.executable), encoding="utf-8")
    exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / "calls.log"
    monkeypatch.setattr(config, "YTDLP_BIN", str(exe))
    monkeypatch.setattr(config, "DENO_BIN", "/opt/deno/deno")
    monkeypatch.setenv("FAKE_LOG", str(log))
    monkeypatch.setenv("FAKE_INFO", json.dumps({"title": "가짜 노래", "channel": "채널", "duration": 3,
                                               "thumbnail": "https://i.ytimg.com/x.jpg", "_type": "video"}))
    monkeypatch.setenv("FAKE_MODE", "ok")

    def calls():
        return [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
    return calls


def _new():
    job = store.create_job("extract")
    track = store.create_track(job["jobId"], "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    return job["jobId"], track["trackId"]


def test_parse_progress():
    assert ytdlp_cli.parse_progress("EMPROG downloading 1024 252182 NA 962\n") == {
        "status": "downloading", "downloaded_bytes": 1024, "total_bytes": 252182,
        "total_bytes_estimate": None, "eta": 962}
    assert ytdlp_cli.parse_progress("EMPROG finished 5 5 NA NA")["eta"] is None
    assert ytdlp_cli.parse_progress("[download] 10% of 1MiB") is None
    assert ytdlp_cli.parse_progress("") is None


@needs_ffmpeg
def test_cli_extract_success(fake, tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_SOURCE", str(make_tone(tmp_path / "src.wav", 3)))
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    job = store.get_job(job_id)
    assert job["status"] == "done", job["error"]
    assert job["result"]["track"]["title"] == "가짜 노래"
    assert config.track_audio_path(track_id).exists() and config.track_peaks_path(track_id).exists()

    info_call, dl_call = fake()
    # 인자 리스트 · 재생목록 끔 · deno 경로 · 주소 앞 "--" (옵션 주입 방지)
    assert "--no-playlist" in info_call and info_call[-2:] == ["--", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
    assert info_call[info_call.index("--js-runtimes") + 1] == "deno:/opt/deno/deno"
    # 받기는 정보를 다시 묻지 않고(--load-info-json) 오디오만
    assert "--load-info-json" in dl_call and dl_call[dl_call.index("-f") + 1] == "bestaudio/best"
    assert "--progress-template" in dl_call and "--newline" in dl_call


@needs_ffmpeg
def test_cli_progress_reaches_job(fake, tmp_path, monkeypatch):
    monkeypatch.setenv("FAKE_SOURCE", str(make_tone(tmp_path / "src.wav", 2)))
    seen = []
    real_update = store.update_job

    def spy(job_id, **fields):
        if "progress" in fields:
            seen.append(fields["progress"])
        return real_update(job_id, **fields)
    monkeypatch.setattr(store, "update_job", spy)
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    assert store.get_job(job_id)["status"] == "done"
    # 가짜가 낸 첫 진행 줄(100/1000 바이트) → 5 + 0.1×75 = 12. 받기 구간(5~80) 안의 값이 실제로 들어와야 함
    assert 12 in seen
    assert all(p in (0, 5, 80, 90) or 5 < p < 80 for p in seen)


@pytest.mark.parametrize("mode,code", [("unavailable", "VIDEO_UNAVAILABLE"), ("bot", "EXTRACT_FAILED"),
                                       ("dl_error", "EXTRACT_FAILED")])
def test_cli_errors_classified(fake, tmp_path, monkeypatch, mode, code):
    monkeypatch.setenv("FAKE_MODE", mode)
    monkeypatch.setenv("FAKE_SOURCE", str(tmp_path / "none"))
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    job = store.get_job(job_id)
    assert job["status"] == "failed" and job["error"]["code"] == code


def test_cli_too_long_from_info(fake, monkeypatch):
    monkeypatch.setenv("FAKE_INFO", json.dumps({"title": "t", "duration": 20 * 60 + 1}))
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    assert store.get_job(job_id)["error"]["code"] == "TOO_LONG"
    assert len(fake()) == 1                      # 받기는 시작도 안 함


def test_cli_too_big_file_stops_download(fake, monkeypatch, tmp_path):
    monkeypatch.setenv("FAKE_TOTAL", str(extract.MAX_DOWNLOAD_BYTES + 1))
    monkeypatch.setenv("FAKE_MODE", "hang_dl")   # 멈추지 않으면 30초 — 훅이 끊어야 함
    monkeypatch.setenv("FAKE_SOURCE", str(tmp_path / "none"))
    import time
    started = time.monotonic()
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    assert store.get_job(job_id)["error"]["code"] == "TOO_LONG"
    assert time.monotonic() - started < 10


@pytest.mark.parametrize("mode", ["hang_info", "hang_dl"])
def test_cli_timeout(fake, monkeypatch, tmp_path, mode):
    monkeypatch.setattr(config, "EXTRACT_TIMEOUT_SEC", 1)
    monkeypatch.setenv("FAKE_MODE", mode)
    monkeypatch.setenv("FAKE_SOURCE", str(tmp_path / "none"))
    job_id, track_id = _new()
    extract.run_extract(job_id, track_id)
    assert store.get_job(job_id)["error"]["code"] == "TIMEOUT"


def test_self_update_runs_only_when_enabled(fake, monkeypatch):
    monkeypatch.setattr(config, "YTDLP_AUTO_UPDATE", False)
    ytdlp_cli.self_update()
    assert fake() == []
    monkeypatch.setattr(config, "YTDLP_AUTO_UPDATE", True)
    ytdlp_cli.self_update()
    assert fake() == [["-U"]]
    assert ytdlp_cli.ready.is_set()


def test_self_update_failure_keeps_going(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "YTDLP_BIN", str(tmp_path / "missing-yt-dlp"))
    monkeypatch.setattr(config, "YTDLP_AUTO_UPDATE", True)
    ytdlp_cli.self_update()                      # 예외 없이 끝나고
    assert ytdlp_cli.ready.is_set()              # 추출은 막히지 않음


def test_library_used_when_no_binary(monkeypatch):
    monkeypatch.setattr(config, "YTDLP_BIN", "")
    assert not ytdlp_cli.enabled()
