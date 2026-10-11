"""worker 이미지에는 fastapi가 없다 → worker가 쓰는 모듈은 fastapi 없이 import 되어야 한다."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CODE = """
import sys
for name in ("fastapi", "starlette"):
    sys.modules[name] = None  # import하면 ImportError
import worker.celery_app
import worker.media
for m in worker.celery_app.celery_app.conf.include:
    __import__(m)
print("ok")
"""


def test_worker_imports_without_fastapi():
    out = subprocess.run(
        [sys.executable, "-c", CODE],
        cwd=ROOT,
        env={"PYTHONPATH": f"{ROOT / 'backend'}:{ROOT}", "PATH": ""},
        capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "ok"
