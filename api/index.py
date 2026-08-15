"""Dependency-free Vercel adapter for the hackathon deployment."""

import base64
import json
import os
import re
import uuid
from http.server import BaseHTTPRequestHandler
from mimetypes import guess_type
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "frontend" / "dist"
SESSIONS: dict[str, dict] = {}
SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions"
SARVAM_BASE_URL = "https://api.sarvam.ai"

# Keep the hero experiment with the function rather than depending on Vercel's
# optional function-bundle globbing. The full editable config remains in
# backend/experiments/chemistry_separation.json for local development.
EXPERIMENTS = {
    "chemistry_separation": {
        "id": "chemistry_separation",
        "subject": "Chemistry",
        "title": "Separation of Substances",
        "grade": 6,
        "accent": "#2dd4bf",
        "goal": "Separate a mixture of sand, salt and water using filtration and evaporation.",
        "intro": "Namaste {student_name}! Let's separate a muddy mixture together.",
        "steps": [
            {
                "id": "mix",
                "instruction": "Add the sand and salt to the water and stir well.",
                "action": "stir",
                "state_change": {"mixture": "mixed"},
                "concept": "Salt dissolves in water; sand does not — it stays as tiny bits.",
            },
            {
                "id": "filter",
                "instruction": "Pour the mixture slowly through the filter paper.",
                "action": "pour_filter",
                "state_change": {"sand_separated": True},
                "concept": "Filtration traps the insoluble sand and lets the salty water pass.",
            },
            {
                "id": "evaporate",
                "instruction": "Heat the filtered water until it all boils away.",
                "action": "heat",
                "state_change": {"water_boiled": True, "salt_visible": True},
                "concept": "Water evaporates and leaves the dissolved salt behind as crystals.",
            },
        ],
        "checkpoints": [
            {
                "after_step": "filter",
                "question": "What stayed on the filter paper?",
                "expected": "the sand",
                "hint": "Think about what did not dissolve.",
            },
            {
                "after_step": "evaporate",
                "question": "Where did the salt come from when the water disappeared?",
                "expected": "it was dissolved in the water all along",
                "hint": "The salt didn't leave — it was hiding in the water.",
            },
        ],
    }
}


def load_experiment(experiment_id: str) -> dict:
    experiment = EXPERIMENTS.get(experiment_id)
    if not experiment:
        raise KeyError("Unknown experiment")
    return experiment


def get_or_restore_session(body: dict) -> dict:
    """Restore a demo session when Vercel schedules a request elsewhere.

    The local FastAPI build intentionally uses in-memory state. A serverless
    deployment has no instance affinity, so the browser also sends a tiny
    non-sensitive session snapshot with each turn/report request. This keeps
    the hackathon demo reliable without adding a database.
    """
    session_id = body.get("session_id")
    session = SESSIONS.get(session_id)
    if session:
        return session

    snapshot = body.get("session_context")
    if not session_id or not isinstance(snapshot, dict):
        raise KeyError("Session expired")
    experiment_id = snapshot.get("experiment_id")
    if experiment_id not in EXPERIMENTS:
        raise KeyError("Unknown experiment")
    session = {
        "student_name": snapshot.get("student_name", "Aarav"),
        "language": snapshot.get("language", "hi-IN"),
        "experiment_id": experiment_id,
        "scene_state": snapshot.get("scene_state", {}),
        "history": snapshot.get("history", [])[-4:],
        "event_log": snapshot.get("event_log", []),
    }
    SESSIONS[session_id] = session
    return session


def sarvam_reply(messages: list[dict], model: str = "sarvam-105b-conversations") -> str:
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        return "The lab guide is ready, but its Sarvam key has not been configured yet."
    request = Request(
        SARVAM_URL,
        data=json.dumps({"model": model, "messages": messages, "temperature": 0.5}).encode(),
        headers={"api-subscription-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read())["choices"][0]["message"]["content"]
    except (HTTPError, URLError, KeyError, ValueError) as error:
        return f"The lab guide could not reach Sarvam right now: {error}."


def _sarvam_key() -> str:
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise RuntimeError("SARVAM_API_KEY is not configured for the Vercel production environment")
    return key


def sarvam_transcribe(encoded_audio: str, language: str) -> str:
    """Call Saaras v3 using only Python's standard library.

    The browser sends MediaRecorder's WebM/Opus blob as base64 JSON. Sarvam
    expects that same data as a multipart file field named ``file``.
    """
    try:
        audio = base64.b64decode(encoded_audio, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("The microphone recording was not valid audio data") from error
    if not audio:
        raise ValueError("The microphone recording was empty")
    if len(audio) > 10 * 1024 * 1024:
        raise ValueError("The microphone recording is too large; please try a shorter message")

    boundary = f"----VirtualScienceLab{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for name, value in (("model", "saaras:v3"), ("mode", "transcribe"), ("language_code", language)):
        parts.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode("utf-8"), b"\r\n",
        ])
    parts.extend([
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n',
        b"Content-Type: audio/webm\r\n\r\n", audio, b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    request = Request(
        f"{SARVAM_BASE_URL}/speech-to-text",
        data=b"".join(parts),
        headers={
            "api-subscription-key": _sarvam_key(),
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        transcript = json.loads(response.read()).get("transcript")
    if not transcript:
        raise ValueError("Sarvam did not return a transcript")
    return str(transcript)


def sarvam_speak(text: str, language: str) -> str:
    """Call Bulbul v3 and return base64 WAV suitable for the browser Audio API."""
    request = Request(
        f"{SARVAM_BASE_URL}/text-to-speech",
        data=json.dumps({
            "text": text,
            "language_code": language,
            "model": "bulbul:v3",
            "speaker": "priya",
        }).encode(),
        headers={"api-subscription-key": _sarvam_key(), "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        audios = json.loads(response.read()).get("audios", [])
    audio = "".join(audios)
    if not audio:
        raise ValueError("Sarvam did not return speech audio")
    return audio


class handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def request_path(self) -> str:
        path = self.path.split("?", 1)[0]
        prefix = "/api/index.py"
        return (path[len(prefix):] or "/") if path.startswith(prefix) else path

    def request_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        path = self.request_path()
        if path == "/health":
            self.send_json({"status": "ok", "runtime": "vercel-stdlib"})
            return
        if path.startswith("/experiments/"):
            try:
                self.send_json(load_experiment(path.rsplit("/", 1)[-1]))
            except KeyError:
                self.send_json({"detail": "Unknown experiment_id"}, 404)
            return
        # The Vercel Python runtime claims the root route for this backend
        # deployment. Serve the Vite output directly so / remains the lab
        # home screen and hashed JS/CSS assets resolve through the same function.
        relative = "index.html" if path == "/" else path.lstrip("/")
        candidate = (STATIC_DIR / relative).resolve()
        if STATIC_DIR in candidate.parents or candidate == STATIC_DIR:
            if candidate.is_file():
                content = candidate.read_bytes()
                content_type = guess_type(candidate.name)[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
        self.send_json({"detail": "Not found"}, 404)

    def do_POST(self):
        path = self.request_path()
        try:
            body = self.request_body()
        except (ValueError, json.JSONDecodeError):
            self.send_json({"detail": "Invalid JSON"}, 400)
            return
        if path == "/warmup":
            self.send_json({"ok": True})
            return
        if path == "/session/start":
            try:
                experiment = load_experiment(body["experiment_id"])
                session_id = str(uuid.uuid4())
                SESSIONS[session_id] = {
                    "student_name": body.get("student_name", "Aarav"), "language": body.get("language", "hi-IN"),
                    "experiment_id": body["experiment_id"], "scene_state": {"current_step_id": experiment["steps"][0]["id"]},
                    "history": [], "event_log": [{"type": "session_start"}],
                }
                self.send_json({"session_id": session_id, "greeting_text": experiment["intro"].format(student_name=body.get("student_name", "Aarav"))})
            except (KeyError, IndexError):
                self.send_json({"detail": "Invalid session request"}, 400)
            return
        try:
            session = get_or_restore_session(body)
        except KeyError:
            self.send_json({"detail": "Session expired. Start the experiment again."}, 404)
            return
        if path == "/session/action":
            session["scene_state"] = body.get("scene_state", session["scene_state"])
            session["event_log"].append({"type": "action", "step_id": body.get("step_id"), "action": body.get("action")})
            self.send_json({"ok": True})
            return
        if path == "/respond":
            input_type = body.get("input_type", "text")
            try:
                transcript = (
                    body.get("input", "")
                    if input_type == "text"
                    else sarvam_transcribe(body.get("input", ""), session["language"])
                )
            except (HTTPError, URLError, ValueError, RuntimeError) as error:
                self.send_json({"detail": f"Speech-to-text failed: {error}"}, 502)
                return
            session["scene_state"] = body.get("scene_state", session["scene_state"])
            experiment = load_experiment(session["experiment_id"])
            step_id = session["scene_state"].get("current_step_id")
            step = next((item for item in experiment["steps"] if item["id"] == step_id), experiment["steps"][0])
            messages = [{"role": "system", "content": f"You are a friendly Grade-6 science guide. Speak only in {session['language']}. Reply in one or two short sentences."}, {"role": "user", "content": f"Experiment: {experiment['title']}. Current step: {step['instruction']}. Concept: {step['concept']}. Child: {transcript}"}]
            reply = re.sub(r"\b(CORRECT|NEEDS_WORK)\b", "", sarvam_reply(messages), flags=re.I).strip()
            session["event_log"].append({"type": "guide_turn", "step_id": step_id, "transcript": transcript, "reply": reply})
            reply_audio = None
            reply_audio_error = None
            if input_type == "audio":
                try:
                    reply_audio = sarvam_speak(reply, session["language"])
                except (HTTPError, URLError, ValueError, RuntimeError) as error:
                    # Preserve the text reply, but make a TTS outage visible instead
                    # of silently looking like a browser playback problem.
                    reply_audio_error = f"Text-to-speech failed: {error}"
            self.send_json({"reply_text": reply, "reply_audio": reply_audio, "reply_audio_error": reply_audio_error, "transcript": transcript if input_type == "audio" else None})
            return
        if path == "/session/report":
            report = sarvam_reply([{"role": "user", "content": f"Write a 4-line English teacher report for this Grade-6 lab session: {json.dumps(session['event_log'])}"}], "sarvam-105b")
            self.send_json({"report_text": report})
            return
        self.send_json({"detail": "Unknown endpoint"}, 404)
