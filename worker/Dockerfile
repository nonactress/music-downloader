# build context = 레포 루트 (docker-compose.yml)
# worker는 backend/app (ffmpeg_builder, store, config)를 함께 쓴다
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/srv
WORKDIR /srv

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp가 유튜브 서명 해석에 쓰는 JS 런타임
COPY --from=denoland/deno:bin-2.4.5 /deno /usr/local/bin/deno

COPY worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# yt-dlp 갱신 (결정 51): PyPI의 yt-dlp 정보가 바뀌면(새 버전) 이 줄부터 캐시가 깨져서
# `docker compose build worker`만 해도 최신 yt-dlp를 받는다. 새 버전이 없으면 캐시 그대로.
ADD https://pypi.org/pypi/yt-dlp/json /tmp/yt-dlp-release.json
RUN pip install --no-cache-dir --upgrade "yt-dlp[default]" && python -m yt_dlp --version

COPY backend/app /srv/app
COPY worker /srv/worker

RUN useradd --create-home --uid 1000 appuser && mkdir -p /data && chown appuser /data
USER appuser

# -B: 24시간 지난 파일 삭제용 beat를 worker 안에서 함께 실행 (compose 서비스 3개 유지)
CMD ["celery", "-A", "worker.celery_app", "worker", "-B", "--loglevel=info", "--concurrency=2", "--schedule=/tmp/celerybeat-schedule"]
