import pytest

from app.ffmpeg_builder import (
    LOUDNORM,
    TrackEdit,
    build_command,
    build_filter,
    total_duration,
)


def test_single_track_trim_only():
    f = build_filter([TrackEdit(12.5, 200.0)], crossfade=2, normalize=False)
    assert f == "[0:a]atrim=start=12.5:end=200,asetpts=PTS-STARTPTS[a0];[a0]anull[out]"


def test_speed_keep_pitch_uses_atempo():
    f = build_filter([TrackEdit(0, 60, 1.25, True)], 0, False)
    assert "atempo=1.25" in f
    assert "asetrate" not in f


def test_speed_without_pitch_uses_asetrate():
    f = build_filter([TrackEdit(0, 60, 1.25, False)], 0, False)
    assert "asetrate=55125,aresample=44100" in f
    assert "atempo" not in f


def test_atempo_out_of_range_is_chained():
    f = build_filter([TrackEdit(0, 60, 3.0, True)], 0, False)
    assert "atempo=2,atempo=1.5" in f
    f = build_filter([TrackEdit(0, 60, 0.25, True)], 0, False)
    assert "atempo=0.5,atempo=0.5" in f


def test_order_trim_speed_normalize():
    f = build_filter([TrackEdit(1, 61, 1.25, True)], 0, True)
    chain = f.split("[a0]")[0]
    assert chain.index("atrim") < chain.index("atempo") < chain.index("loudnorm")
    assert LOUDNORM in chain


def test_concat_without_crossfade():
    tracks = [TrackEdit(0, 10), TrackEdit(0, 20), TrackEdit(5, 15)]
    f = build_filter(tracks, 0, False)
    assert f.endswith("[a0][a1][a2]concat=n=3:v=0:a=1[out]")
    assert "[2:a]atrim=start=5:end=15" in f


def test_crossfade_chain():
    tracks = [TrackEdit(0, 10), TrackEdit(0, 20), TrackEdit(0, 30)]
    f = build_filter(tracks, 2, False)
    assert "[a0][a1]acrossfade=d=2[x1]" in f
    assert "[x1][a2]acrossfade=d=2[out]" in f
    assert "concat" not in f


def test_two_tracks_crossfade_goes_to_out():
    f = build_filter([TrackEdit(0, 10), TrackEdit(0, 10)], 1.5, False)
    assert f.endswith("[a0][a1]acrossfade=d=1.5[out]")


def test_crossfade_longer_than_track_rejected():
    # 3초 구간을 1.5배 → 2초, 크로스페이드 2초면 거절
    with pytest.raises(ValueError):
        build_filter([TrackEdit(0, 60), TrackEdit(0, 3, 1.5)], 2, False)


def test_crossfade_ignored_for_single_short_track():
    build_filter([TrackEdit(0, 1)], 2, False)


@pytest.mark.parametrize(
    "track",
    [TrackEdit(-1, 10), TrackEdit(10, 10), TrackEdit(10, 5), TrackEdit(0, 10, 0)],
)
def test_invalid_track_rejected(track):
    with pytest.raises(ValueError):
        build_filter([track], 0, False)


def test_empty_rejected():
    with pytest.raises(ValueError):
        build_filter([], 0, False)


def test_total_duration():
    tracks = [TrackEdit(0, 100), TrackEdit(0, 50, 1.25)]
    assert total_duration(tracks, 2) == pytest.approx(100 + 40 - 2)
    assert total_duration(tracks, 0) == pytest.approx(140)


def test_build_command_is_arg_list():
    cmd = build_command(["/d/a.wav", "/d/b; rm -rf /.wav"],
                        [TrackEdit(0, 10), TrackEdit(0, 10)], 0, True, "/d/out.mp3")
    assert cmd[0] == "ffmpeg"
    assert cmd.count("-i") == 2
    # 파일 이름은 하나의 인자로 그대로 전달 (셸 해석 없음)
    assert "/d/b; rm -rf /.wav" in cmd
    assert cmd[cmd.index("-map") + 1] == "[out]"
    assert cmd[-1] == "/d/out.mp3"


def test_build_command_mismatch():
    with pytest.raises(ValueError):
        build_command(["a"], [TrackEdit(0, 1), TrackEdit(0, 1)], 0, False, "o.mp3")
