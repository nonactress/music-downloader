# build context = 레포 루트 (docker-compose.yml)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/srv
WORKDIR /srv

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend/app /srv/app

# worker와 같은 uid → 공유 볼륨 /data 권한 일치
RUN useradd --create-home --uid 1000 appuser && mkdir -p /data && chown appuser /data
USER appuser

EXPOSE 8000
# 프록시 헤더는 app/ratelimit.py가 TRUSTED_PROXY_IPS 기준으로 직접 판단 (결정 50)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
