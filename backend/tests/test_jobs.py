from app import store


def test_get_job(client):
    job = store.create_job("extract")
    res = client.get(f"/jobs/{job['jobId']}")
    assert res.status_code == 200
    assert res.json() == job
    assert list(res.json()) == ["jobId", "kind", "status", "progress", "etaSeconds",
                                "track", "result", "error"]


def test_get_job_missing(client):
    res = client.get("/jobs/j_nope")
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "NOT_FOUND",
                                    "message": "노래를 찾을 수 없어요. 처음부터 다시 해주세요."}}


def test_job_has_24h_ttl(fake_redis):
    job = store.create_job("extract")
    store.update_job(job["jobId"], status="running", progress=10)
    ttl = fake_redis.ttl(f"job:{job['jobId']}")
    assert 24 * 3600 - 5 < ttl <= 24 * 3600


def test_update_job_rules():
    jid = store.create_job("extract")["jobId"]
    store.update_job(jid, status="running", progress=150)
    assert store.get_job(jid)["progress"] == 99  # running은 99까지
    store.update_job(jid, progress=10)
    assert store.get_job(jid)["progress"] == 99  # 줄어들지 않음
    store.fail_job(jid, {"code": "TIMEOUT", "message": "m"})
    store.update_job(jid, status="done")
    job = store.get_job(jid)
    assert job["status"] == "failed" and job["progress"] == 99  # 끝난 작업은 그대로
