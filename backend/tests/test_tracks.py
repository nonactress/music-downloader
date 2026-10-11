import pytest

from app import queue, store
from app.errors import ApiError
from app.youtube import normalize_url

VID = "dQw4w9WgXcQ"
CANON = f"https://www.youtube.com/watch?v={VID}"


@pytest.mark.parametrize("url", [
    f"https://www.youtube.com/watch?v={VID}",
    f"http://youtube.com/watch?v={VID}&t=30s",
    f"https://m.youtube.com/watch?v={VID}",
    f"https://music.youtube.com/watch?v={VID}&si=abc",
    f"https://youtu.be/{VID}?si=xyz",
    f"https://www.youtube.com/shorts/{VID}",
    f"https://www.youtube.com/embed/{VID}",
    f"www.youtube.com/watch?v={VID}",
    f"  https://WWW.YouTube.com/watch?v={VID}  ",
    f"https://www.youtube.com/watch?v={VID}&list=PL1234567890",  # 영상 하나만
])
def test_valid_urls_normalized(url):
    assert normalize_url(url) == CANON


@pytest.mark.parametrize("url", [
    "",
    "hello",
    f"https://evil.com/watch?v={VID}",
    f"https://youtube.com.evil.com/watch?v={VID}",
    f"https://evilyoutube.com/watch?v={VID}",
    f"https://user@www.youtube.com/watch?v={VID}",
    f"ftp://www.youtube.com/watch?v={VID}",
    f"file:///etc/passwd",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ;rm -rf",
    "https://www.youtube.com/",
    "https://www.youtube.com/@channel",
    "https://www.youtube.com:99999/watch?v=dQw4w9WgXcQ",
    "--exec=whoami",
])
def test_invalid_urls(url):
    with pytest.raises(ApiError) as e:
        normalize_url(url)
    assert e.value.code == "INVALID_URL"


@pytest.mark.parametrize("url", [
    "https://www.youtube.com/playlist?list=PL1234567890",
    "https://music.youtube.com/playlist?list=OLAK5uy_abc",
    "https://www.youtube.com/watch?list=PL1234567890",
])
def test_playlist_rejected(url):
    with pytest.raises(ApiError) as e:
        normalize_url(url)
    assert e.value.code == "PLAYLIST_NOT_ALLOWED"


def test_post_tracks_creates_job(client, sent):
    res = client.post("/tracks", json={"url": f"https://youtu.be/{VID}"})
    assert res.status_code == 202
    body = res.json()
    assert set(body) == {"jobId", "trackId"}
    assert sent == [(queue.EXTRACT_TASK, body["jobId"], body["trackId"])]
    job = store.get_job(body["jobId"])
    assert job == {
        "jobId": body["jobId"], "kind": "extract", "status": "queued", "progress": 0,
        "etaSeconds": None, "track": None, "result": None, "error": None,
    }
    assert store.get_track(body["trackId"])["url"] == CANON


def test_post_tracks_invalid_url(client, sent):
    res = client.post("/tracks", json={"url": "https://naver.com"})
    assert res.status_code == 400
    assert res.json() == {"error": {
        "code": "INVALID_URL", "message": "유튜브 주소가 아니에요. 주소를 다시 확인해 주세요."}}
    assert sent == []


def test_post_tracks_playlist(client, sent):
    res = client.post("/tracks", json={"url": "https://www.youtube.com/playlist?list=PLx"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "PLAYLIST_NOT_ALLOWED"
    assert sent == []


@pytest.mark.parametrize("payload", [{}, {"url": 123}, {"link": "x"}])
def test_post_tracks_bad_body(client, payload):
    res = client.post("/tracks", json=payload)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_URL"


def test_unknown_field_ignored(client):
    res = client.post("/tracks", json={"url": f"https://youtu.be/{VID}", "foo": 1})
    assert res.status_code == 202


def test_unknown_route_404_format(client):
    res = client.get("/nope")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
