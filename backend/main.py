import base64
import json
import re
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import prompts
import sarvam
import session as session_store

app = FastAPI(title="Virtual Science Lab")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

EXPERIMENTS_DIR = Path(__file__).parent / "experiments"


@app.get("/health")
def health():
    return {"status": "ok"}


# --- helpers -----------------------------------------------------------

def _load_experiment(experiment_id: str) -> dict:
    path = EXPERIMENTS_DIR / f"{experiment_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Unknown experiment_id: {experiment_id}")
    return json.loads(path.read_text())


def _get_session(session_id: str) -> dict:
    try:
        return session_store.get_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown session_id: {session_id}")


def _find_step(experiment: dict, step_id: Optional[str]) -> dict:
    for step in experiment["steps"]:
        if step["id"] == step_id:
            return step
    return experiment["steps"][0]


def _find_checkpoint(experiment: dict, step_id: Optional[str]) -> dict:
    for checkpoint in experiment["checkpoints"]:
        if checkpoint["after_step"] == step_id:
            return checkpoint
    raise HTTPException(
        status_code=400,
        detail=f"No checkpoint defined after step '{step_id}' for mode=evaluate",
    )


def _parse_verdict(reply_text: str) -> tuple[str, Optional[str]]:
    """Strip the trailing CORRECT/NEEDS_WORK verdict token, per CLAUDE.md §7."""
    match = re.search(r"\b(CORRECT|NEEDS_WORK)\b", reply_text, re.IGNORECASE)
    if not match:
        return reply_text.strip(), None
    verdict = match.group(1).upper()
    child_text = (reply_text[: match.start()] + reply_text[match.end():]).strip()
    child_text = re.sub(r"[\s:\-–—]+$", "", child_text).strip()
    return child_text, verdict


# --- request/response models -------------------------------------------

class SessionStartRequest(BaseModel):
    student_name: str
    language: str
    experiment_id: str


class SessionStartResponse(BaseModel):
    session_id: str
    greeting_text: str


class RespondRequest(BaseModel):
    session_id: str
    input: str
    input_type: Literal["text", "audio"] = "text"
    scene_state: dict = {}
    mode: Literal["guide", "evaluate"] = "guide"


class RespondResponse(BaseModel):
    reply_text: str
    reply_audio: Optional[str] = None  # base64-encoded WAV, voice turns only
    transcript: Optional[str] = None   # ASR transcript, voice turns only


class ReportRequest(BaseModel):
    session_id: str


class ReportResponse(BaseModel):
    report_text: str


class SessionActionRequest(BaseModel):
    session_id: str
    step_id: str
    action: str
    scene_state: dict = {}


class SessionActionResponse(BaseModel):
    ok: bool = True


# --- endpoints -----------------------------------------------------------

@app.post("/session/start", response_model=SessionStartResponse)
def start_session(body: SessionStartRequest):
    experiment = _load_experiment(body.experiment_id)

    session = session_store.create_session(body.student_name, body.language, body.experiment_id)
    session_store.update_scene_state(session["session_id"], {
        "current_step_id": experiment["steps"][0]["id"],
        "awaiting_answer": False,
    })
    session_store.append_event(session["session_id"], {
        "type": "session_start",
        "experiment_id": body.experiment_id,
    })

    greeting_text = experiment["intro"].format(student_name=body.student_name)
    return SessionStartResponse(session_id=session["session_id"], greeting_text=greeting_text)


@app.post("/respond", response_model=RespondResponse)
def respond(body: RespondRequest):
    session = _get_session(body.session_id)
    experiment = _load_experiment(session["experiment_id"])

    session_store.update_scene_state(body.session_id, body.scene_state)

    if body.input_type == "audio":
        # `input` carries base64-encoded audio (webm/opus from the browser's
        # MediaRecorder) rather than a file upload, so voice and text share
        # one JSON request shape through this endpoint.
        try:
            audio_bytes = base64.b64decode(body.input)
        except Exception:
            raise HTTPException(status_code=400, detail="input must be base64-encoded audio when input_type='audio'")
        try:
            transcript = sarvam.asr(audio_bytes, session["language"], filename="audio.webm")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Speech-to-text failed: {e}")
    else:
        transcript = body.input

    session_store.append_history(body.session_id, "child", transcript)

    current_step_id = body.scene_state.get("current_step_id")

    if body.mode == "guide":
        current_step = _find_step(experiment, current_step_id)
        messages = prompts.build_guide_prompt(session, experiment, transcript, current_step)
        reply_text = sarvam.llm(messages)
        child_text, verdict = reply_text.strip(), None
        event = {
            "type": "guide_turn",
            "step_id": current_step["id"],
            "transcript": transcript,
            "reply": child_text,
        }
    else:  # mode == "evaluate"
        checkpoint = _find_checkpoint(experiment, current_step_id)
        messages = prompts.build_evaluate_prompt(session, checkpoint, transcript)
        reply_text = sarvam.llm(messages)
        child_text, verdict = _parse_verdict(reply_text)
        event = {
            "type": "checkpoint",
            "step_id": current_step_id,
            "question": checkpoint["question"],
            "transcript": transcript,
            "verdict": verdict,
            "reply": child_text,
        }

    session_store.append_history(body.session_id, "guide", child_text)
    session_store.append_event(body.session_id, event)

    reply_audio = None
    if body.input_type == "audio":
        try:
            audio_out = sarvam.tts(child_text, session["language"])
            reply_audio = base64.b64encode(audio_out).decode("ascii")
        except Exception:
            # Degrade to a text-only reply rather than losing the whole turn.
            reply_audio = None

    return RespondResponse(
        reply_text=child_text,
        reply_audio=reply_audio,
        transcript=transcript if body.input_type == "audio" else None,
    )


@app.post("/session/action", response_model=SessionActionResponse)
def session_action(body: SessionActionRequest):
    """Log a physical scene action (stir/pour_filter/heat) directly to
    event_log — no LLM call. Keeps the authoritative server-side event_log
    (which /session/report reads) aware of step completions, not just
    guide/evaluate conversational turns.
    """
    _get_session(body.session_id)  # 404 if unknown
    session_store.update_scene_state(body.session_id, body.scene_state)
    session_store.append_event(body.session_id, {
        "type": "action",
        "step_id": body.step_id,
        "action": body.action,
    })
    return SessionActionResponse()


@app.post("/session/report", response_model=ReportResponse)
def session_report(body: ReportRequest):
    session = _get_session(body.session_id)
    experiment = _load_experiment(session["experiment_id"])

    messages = prompts.build_report_prompt(session, experiment)
    report_text = sarvam.llm(messages, model=sarvam.REPORT_LLM_MODEL)

    return ReportResponse(report_text=report_text)
