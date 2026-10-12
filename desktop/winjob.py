"""윈도우: 프로그램이 끝나면(강제 종료 포함) ffmpeg · yt-dlp 자식 프로세스도 같이 끝나게.
현재 프로세스를 'KILL_ON_JOB_CLOSE' 작업 개체에 넣으면 이후 자식들도 같은 작업에 들어간다."""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)
_job = None


def kill_children_on_exit() -> None:  # pragma: no cover — 윈도우 전용, CI selftest로 확인
    global _job
    if os.name != "nt" or _job is not None:
        return
    try:
        import ctypes
        from ctypes import wintypes

        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        JobObjectExtendedLimitInformation = 9
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in (
                "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

        class BASIC(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong), ("PerJobUserTimeLimit", ctypes.c_longlong),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class EXTENDED(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", BASIC), ("IoInfo", IO_COUNTERS),
                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = wintypes.HANDLE
        job = k32.CreateJobObjectW(None, None)
        info = EXTENDED()
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not k32.SetInformationJobObject(job, JobObjectExtendedLimitInformation,
                                           ctypes.byref(info), ctypes.sizeof(info)):
            raise OSError(ctypes.get_last_error())
        if not k32.AssignProcessToJobObject(job, k32.GetCurrentProcess()):
            raise OSError(ctypes.get_last_error())
        _job = job  # 핸들을 닫지 않고 들고 있음 → 프로세스가 끝나면 닫히면서 자식도 끝남
    except Exception as e:  # noqa: BLE001 — 실패해도 프로그램은 돌아야 함
        log.warning("자식 프로세스 정리 설정 실패: %s", e)
