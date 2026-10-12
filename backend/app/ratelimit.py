"""IP당 요청 수 제한 (PLAN 12장) → 429 RATE_LIMITED.

사용자 IP (결정 50): 접속한 쪽이 TRUSTED_PROXY_IPS(nginx 등)일 때만 X-Forwarded-For의
맨 오른쪽 값(= 그 프록시가 직접 본 주소)을 쓰고, 그 밖에는 접속 IP를 그대로 쓴다.
맨 왼쪽 값은 사용자가 마음대로 넣을 수 있어서 믿지 않는다.
uvicorn의 자체 프록시 헤더 처리는 끈다 (Dockerfile `--no-proxy-headers`).
"""
from __future__ import annotations

import ipaddress
from functools import lru_cache

from fastapi import Request

from . import config, store
from .errors import ApiError

IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


@lru_cache(maxsize=8)
def _trusted_networks(spec: str) -> tuple[IpNetwork, ...]:
    return tuple(ipaddress.ip_network(part.strip(), strict=False)
                 for part in spec.split(",") if part.strip())


def _parse_ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else ""
    peer_ip = _parse_ip(peer)
    if peer_ip is None or not any(peer_ip in net for net in _trusted_networks(config.TRUSTED_PROXY_IPS)):
        return peer or "unknown"
    # 여러 줄로 온 헤더도 한 목록으로 보고 맨 오른쪽
    hops = [h for line in request.headers.getlist("x-forwarded-for") for h in line.split(",")]
    forwarded = _parse_ip(hops[-1]) if hops else None
    return str(forwarded) if forwarded is not None else peer


def limit_per_ip(request: Request) -> None:
    if store.hit_rate_limit(request.url.path, client_ip(request), config.RATE_LIMIT_PER_MINUTE):
        raise ApiError("RATE_LIMITED")
