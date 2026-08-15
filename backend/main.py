import asyncio
import base64
import json
import re
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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


@app.post("/warmup")
def warmup():
    """Throwaway call to kill Sarvam's cold-start latency before the child's
    first real turn (CLAUDE.md §8 item 5). Frontend fires this on Scene
    mount; touches no session state and swallows its own failures so it can
    never block the demo.
    """
    try:
        sarvam.llm([{"role": "user", "content": "hi"}])
    except Exception:
        pass
    return {"ok": True}


@app.get("/experiments/{experiment_id}")
def get_experiment(experiment_id: str):
    # Lets the frontend drive step/checkpoint progression from the same
    # config the backend uses, instead of duplicating it as hardcoded JS.
    return _load_experiment(experiment_id)


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


_CLAUSE_BOUNDARY_CHARS = "।.!?,"  # danda first — Hindi is the locked demo language


def _pop_clause(buffer: str) -> tuple[Optional[str], str]:
    """Split off the first complete clause from a growing LLM text buffer.
    Returns (clause_or_None, remaining_buffer)."""
    for i, ch in enumerate(buffer):
        if ch in _CLAUSE_BOUNDARY_CHARS:
            return buffer[: i + 1].strip(), buffer[i + 1:]
    return None, buffer


_CLAUSE_TTS_TIMEOUT_S = 8.0


async def _synthesize_clause(clause: str, language: str) -> bytes:
    """Synthesize one clause's audio.

    NOTE — deviates from CLAUDE.md §8 item 2's "pipe into Bulbul WebSocket
    TTS": verified (3 independent reproductions, in and out of FastAPI,
    under both uvloop and plain asyncio) that opening a `websockets`
    connection while an `httpx.AsyncClient` streaming connection to the
    same host (llm_stream) is still open hangs indefinitely in this
    environment — not a design bug, a real httpx/websockets interaction.
    Falling back to the plain REST tts() call (already proven reliable)
    per §9's own rule: never let a polish-pass technique block a working
    demo. The actual latency win — audio for the first clause before the
    full LLM reply exists — is unaffected; only the transport for each
    clause's synthesis changed from WS to REST. Revisit if that hang is
    ever root-caused.
    """
    return await asyncio.wait_for(
        asyncio.to_thread(sarvam.tts, clause, language),
        timeout=_CLAUSE_TTS_TIMEOUT_S,
    )


def _sse(event: dict) -> str:
    return json.dumps(event) + "\n"


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


@app.post("/respond/stream")
async def respond_stream(body: RespondRequest):
    """Streaming twin of /respond, voice-only (CLAUDE.md §8 items 1-2):
    streams llm_stream() and speaks each guide-mode clause as soon as it's
    ready, instead of waiting for the full reply before any audio exists.
    Frontend opts in via a flag and falls back to the plain /respond for
    input_type="text" or if streaming fails.

    Response is newline-delimited JSON events, not a single JSON body:
      {"type": "transcript", "transcript": str}
      {"type": "text_delta", "text": str}          — guide mode only, one
                                                      per LLM token/chunk
      {"type": "audio_chunk", "audio": base64}     — one complete, playable
                                                      clause of audio
      {"type": "done", "reply_text": str, "verdict": str|None}
      {"type": "error", "message": str}            — mid-stream failure

    Evaluate-mode replies never stream clause-by-clause — neither text nor
    audio. The trailing CORRECT/NEEDS_WORK verdict token has no clause
    boundary before it, so anything emitted incrementally (a raw "COR"...
    "RECT" text_delta included) risks the verdict reaching the child before
    it's stripped. Evaluate mode waits for the full reply, strips the
    verdict, and only then emits — one audio_chunk, and reply_text arrives
    already-cleaned in "done".
    """
    if body.input_type != "audio":
        raise HTTPException(status_code=400, detail="Streaming is only implemented for input_type='audio'")

    session = _get_session(body.session_id)
    experiment = _load_experiment(session["experiment_id"])
    session_store.update_scene_state(body.session_id, body.scene_state)

    try:
        audio_bytes = base64.b64decode(body.input)
    except Exception:
        raise HTTPException(status_code=400, detail="input must be base64-encoded audio")

    try:
        transcript = await asyncio.to_thread(sarvam.asr, audio_bytes, session["language"], filename="audio.webm")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Speech-to-text failed: {e}")

    session_store.append_history(body.session_id, "child", transcript)
    current_step_id = body.scene_state.get("current_step_id")
    language = session["language"]
    mode = body.mode

    if mode == "guide":
        current_step = _find_step(experiment, current_step_id)
        messages = prompts.build_guide_prompt(session, experiment, transcript, current_step)
    else:
        checkpoint = _find_checkpoint(experiment, current_step_id)
        messages = prompts.build_evaluate_prompt(session, checkpoint, transcript)

    async def event_stream():
        yield _sse({"type": "transcript", "transcript": transcript})

        full_text = ""
        clause_buffer = ""
        try:
            async for delta in sarvam.llm_stream(messages):
                full_text += delta
                clause_buffer += delta

                if mode == "guide":
                    # Safe to show progressively — nothing is ever trimmed
                    # from a guide reply.
                    yield _sse({"type": "text_delta", "text": delta})
                    clause, clause_buffer = _pop_clause(clause_buffer)
                    while clause:
                        try:
                            audio_bytes_out = await _synthesize_clause(clause, language)
                            if audio_bytes_out:
                                yield _sse({"type": "audio_chunk", "audio": base64.b64encode(audio_bytes_out).decode("ascii")})
                        except Exception:
                            pass  # this clause's audio degrades to text-only; the turn continues
                        clause, clause_buffer = _pop_clause(clause_buffer)
        except Exception as e:
            yield _sse({"type": "error", "message": f"Guide reply failed: {e}"})
            return

        if mode == "guide":
            child_text, verdict = full_text.strip(), None
            if clause_buffer.strip():
                try:
                    audio_bytes_out = await _synthesize_clause(clause_buffer.strip(), language)
                    if audio_bytes_out:
                        yield _sse({"type": "audio_chunk", "audio": base64.b64encode(audio_bytes_out).decode("ascii")})
                except Exception:
                    pass
            event = {
                "type": "guide_turn",
                "step_id": current_step["id"],
                "transcript": transcript,
                "reply": child_text,
            }
        else:
            child_text, verdict = _parse_verdict(full_text)
            try:
                audio_out = await asyncio.to_thread(sarvam.tts, child_text, language)
                yield _sse({"type": "audio_chunk", "audio": base64.b64encode(audio_out).decode("ascii")})
            except Exception:
                pass
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

        yield _sse({"type": "done", "reply_text": child_text, "verdict": verdict})

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


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
