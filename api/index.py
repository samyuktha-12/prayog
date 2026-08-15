"""Vercel serverless entrypoint for the FastAPI app.

The application remains in ``backend/`` for local development.  This thin
entrypoint puts that directory on Python's import path so Vercel can discover
the required module-level ``app`` object from its conventional ``api/``
directory.
"""

from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402, F401
