"""Guide / evaluate / report prompt builders (CLAUDE.md §7).

Each build_* function returns a `messages` list ready to pass straight into
sarvam.llm() / sarvam.llm_stream().
"""

import json


def _format_history(history: list[dict]) -> str:
    if not history:
        return "(none yet)"
    return "\n".join(f"{turn['role']}: {turn['text']}" for turn in history)


def build_guide_prompt(session: dict, experiment: dict, transcript: str, current_step: dict) -> list[dict]:
    system = (
        f"You are a friendly science lab guide for a Grade-6 child named {session['student_name']}. "
        f"Speak ONLY in {session['language']}. Keep replies to 1-2 short sentences a child understands."
    )
    user = (
        f"Experiment: {experiment['title']} — {experiment['goal']}\n"
        f"Current scene state: {json.dumps(session['scene_state'])}\n"
        f"Recent conversation: {_format_history(session['history'])}\n"
        f'The child just said: "{transcript}".\n'
        f"If they ask what to do next, guide the current step: {current_step['instruction']}\n"
        f"If they ask a concept question, answer simply using: {current_step['concept']}\n"
        f"Occasionally, when a step is complete, ask them ONE short check question."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_evaluate_prompt(session: dict, checkpoint: dict, transcript: str) -> list[dict]:
    system = (
        f"You are checking a Grade-6 child's understanding. Speak ONLY in {session['language']}."
    )
    user = (
        f'The question asked was: "{checkpoint["question"]}"\n'
        f'Expected idea: "{checkpoint["expected"]}"\n'
        f'The child answered: "{transcript}".\n'
        f"Decide if the child's idea is roughly correct. Reply in 1-2 sentences:\n"
        f"- If correct: affirm warmly and briefly reinforce why.\n"
        f'- If not: gently correct with the hint: "{checkpoint["hint"]}". Do not shame.\n'
        f"Then return a one-word verdict for logging: CORRECT or NEEDS_WORK."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_report_prompt(session: dict, experiment: dict) -> list[dict]:
    system = "You are writing a short report for a teacher about one lab session."
    user = (
        f"Student: {session['student_name']}. Experiment: {experiment['title']}.\n"
        f"Session events (JSON): {json.dumps(session['event_log'])}\n"
        f"Write 4-6 lines: steps completed, questions the child asked, checkpoint results,\n"
        f"and a plain-language note on what they understood well and where they struggled."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
