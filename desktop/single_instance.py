"""두 번째 실행 막기 (결정 68). 포트가 아니라 데이터 폴더의 잠금 파일로 판단한다
(포트가 쓰이는 이유가 '우리 프로그램'인지 '다른 프로그램'인지 포트만으로는 모름)."""
from __future__ import annotations

import os
from pathlib import Path


class AlreadyRunning(Exception):
    pass


class InstanceLock:
    def __init__(self, path: Path):
        self.path = path
        self._f = None

    def acquire(self) -> "InstanceLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        f = open(self.path, "a+")
        try:
            if os.name == "nt":
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            f.close()
            raise AlreadyRunning(str(e)) from e
        self._f = f  # 프로세스가 끝나면 OS가 풀어 줌 (강제 종료돼도)
        return self

    def release(self) -> None:
        if self._f is not None:
            self._f.close()
            self._f = None
