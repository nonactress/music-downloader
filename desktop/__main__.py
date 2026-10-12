"""`python -m desktop` (개발) · PyInstaller 진입점."""
import sys
from pathlib import Path

if not getattr(sys, "frozen", False):
    # 개발: backend/app · worker를 불러올 수 있게
    root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(root / "backend"), str(root)]

from desktop.launcher import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
