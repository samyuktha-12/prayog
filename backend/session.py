"""In-memory Session store, keyed by session_id (CLAUDE.md §5).

No database. Sessions live only for the lifetime of the process, in a plain
dict, exactly as CLAUDE.md §3 specifies.
"""

import uuid

HISTORY_LIMIT = 4

_SESSIONS: dict[str, dict] = {}


def create_session(student_name: str, language: str, experiment_id: str) -> dict:
    session_id = str(uuid.uuid4())
    session = {
        "session_id": session_id,
        "student_name": student_name,
        "language": language,
        "experiment_id": experiment_id,
        "scene_state": {},
        "history": [],
        "event_log": [],
    }
    _SESSIONS[session_id] = session
    return session


def get_session(session_id: str) -> dict:
    return _SESSIONS[session_id]


def update_scene_state(session_id: str, scene_state: dict) -> None:
    _SESSIONS[session_id]["scene_state"] = scene_state


def append_history(session_id: str, role: str, text: str) -> None:
    """Append a {role, text} turn, keeping only the last HISTORY_LIMIT."""
    history = _SESSIONS[session_id]["history"]
    history.append({"role": role, "text": text})
    del history[:-HISTORY_LIMIT]


def append_event(session_id: str, event: dict) -> None:
    """Append a raw event dict (step completed, question asked, checkpoint
    result, ...) — this is what the report is built from. Log from turn one.
    """
    _SESSIONS[session_id]["event_log"].append(event)
