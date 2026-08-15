# CLAUDE.md — Virtual Science Lab (Grade-6 CBSE, voice-first, regional languages)

> This file is the single source of truth for the coding agent. Read it fully before
> writing code. If you are Codex/OpenAI's agent, note that Codex reads `AGENTS.md` by
> convention — copy or symlink this file: `ln -s CLAUDE.md AGENTS.md`.

---

## 1. What we are building (one paragraph)

A voice-first **virtual science lab** for CBSE **Grade-6** children in areas without
physical labs. A child picks a language (Tamil / Hindi / Kannada), enters an experiment,
and is walked through it inside a simple 3D scene. The child **manipulates** the
experiment, **asks questions by voice or chat**, and the lab **asks the child questions
back** to check understanding. When the session ends, a **teacher report** summarizes what
the child did and understood. Everything is in the child's language.

**This is a 3-hour hackathon build.** Ship a working vertical slice, not a platform.

---

## 2. Scope — READ THIS BEFORE BUILDING

### Build (the vertical slice)
- **One experiment to 100%**: Chemistry — *Separation of Substances* (sand + salt + water
  → filter → evaporate). This is the hero. It must work flawlessly end to end.
- The full loop for that one experiment: manipulate → ask (voice/chat) → get answered →
  get quizzed back → evaluated → session report.
- One demo language selectable at start (default: Hindi or Tamil — confirm at build time).

### Claim, don't build (put on a slide / mock only)
- The other 3 subjects (Physics circuit, Biology water-in-plants, Maths area/perimeter)
  exist as **experiment config files** consumed by the same engine. Generate their configs;
  only build full 3D interaction for chemistry. Physics is the stretch second scene.
- **Teacher "Create Experiment" flow is a DUMMY modal.** It shows a convincing
  "generating your lab…" state and reveals a pre-baked card. Do **not** build a real
  prompt→scene generation pipeline.
- **No auth.** One hardcoded demo student ("Aarav, Grade 6").
- **Offline / on-device Gemma is roadmap, NOT this build.** We use **cloud Sarvam**.

### Non-goals (do not spend a minute on these)
- No database. In-memory session state only.
- No user accounts, login, or persistence across restarts.
- No real file upload processing.
- No Vapi / Pipecat / voice-agent framework. We self-orchestrate (see §4).
- No barge-in / full-duplex audio. This is **turn-based**.

> If you find yourself building auth, a DB, a real generate-pipeline, or all 4 full 3D
> scenes — STOP. That is scope creep and it will sink the demo.

---

## 3. Tech stack (committed — do not substitute)

- **Backend:** Python + **FastAPI**. In-memory session store (a dict). `uvicorn` to serve.
- **Frontend:** **Vite + React** + **@react-three/fiber** (Three.js) for the 3D scene.
  Plain React state; no Redux. (Next.js is acceptable only if already scaffolded.)
- **Voice/LLM:** **Cloud Sarvam**, self-orchestrated as REST/WebSocket calls:
  - **ASR:** Sarvam Speech-to-Text — **Saaras v3**, transcription mode (same-language out).
  - **Loop LLM:** **Sarvam-30B** (chosen for LOW LATENCY — do NOT use 105B in the loop).
  - **TTS:** **Bulbul v3** (REST first; WebSocket streaming for the polish pass).
  - **Report LLM:** **Sarvam-105B**, used ONCE for the end-of-session report (latency
    doesn't matter there; quality does).
- **Env:** `SARVAM_API_KEY` in `backend/.env`. Never commit keys.

> **Do not fabricate Sarvam request/response shapes.** Before writing `sarvam.py`, FETCH
> the current docs at https://docs.sarvam.ai and use the exact endpoints, model strings,
> params, and response fields from there. The Sarvam LLM is OpenAI-compatible; confirm the
> base URL and model id in docs. If a call fails, re-read the docs before guessing.

---

## 4. Architecture — the one idea that makes this simple

**The agent is stateless about the world. The scene state is injected as text every turn.**

Nothing "knows" what's happening in the lab until we tell it, each turn. The 3D frontend
owns the world state and posts it with every request. The backend builds a prompt from
`{scene_state, history, transcript, mode}`, calls the LLM, and returns the reply. There is
**one agent and N experiment configs**, never N agents.

```
child speaks/types
      │
      ▼
[Frontend]  updates scene_state  ──►  POST /respond {input, scene_state, history, mode}
      │                                       │
      │                              [Backend /respond]
      │                                       │
      │      voice path:  audio ─► Saaras(ASR) ─► transcript
      │                                       │
      │                     build prompt (inject scene_state + history + mode)
      │                                       │
      │                              Sarvam-30B (LLM)  ─► reply text (1–2 sentences)
      │                                       │
      │      voice path:  reply text ─► Bulbul(TTS) ─► audio
      │                                       ▼
      ◄───────────────  {reply_text, reply_audio?}
```

Two paths through `/respond`, same brain:
- **Chat:** text in → LLM → text out. Near-zero latency. **This is the spine AND the
  on-stage fallback if wifi kills voice.**
- **Voice:** audio → Saaras → LLM → Bulbul → audio.

---

## 5. Session object (single source of truth, server-side, keyed by `session_id`)

```python
Session = {
  "session_id": str,
  "student_name": str,       # "Aarav"
  "language": str,           # "hi-IN" | "ta-IN" | "kn-IN" (confirm codes in Sarvam docs)
  "experiment_id": str,      # "chemistry_separation"
  "scene_state": dict,       # posted by frontend each turn (current world state)
  "history": list,           # last ~4 {role, text} turns — prevents repetition
  "event_log": list,         # steps completed, questions asked, eval results → report
}
```

- `scene_state` **drives** the agent.
- `history` keeps the last ~4 turns so it doesn't repeat itself.
- `event_log` is appended to on every meaningful action and is what the report is built
  from. **Log from turn one** — do not try to reconstruct it at the end.

---

## 6. Endpoints

### `POST /session/start`
In: `{student_name, language, experiment_id}`
Out: `{session_id, greeting_text, greeting_audio?}`
Creates the session, loads the experiment config, returns a greeting that uses the child's
name in their language ("scene prepared specially for this kid" = name+language injected).

### `POST /respond`  ← core loop
In: `{session_id, input, input_type: "text"|"audio", scene_state, mode: "guide"|"evaluate"}`
- If `input_type == "audio"`: run Saaras ASR → transcript. Else transcript = input.
- Update stored `scene_state`, append to `history`/`event_log`.
- Build prompt (see §7), call Sarvam-30B.
- If voice: Bulbul TTS on the reply.
Out: `{reply_text, reply_audio?, transcript?}`

`mode="guide"`  → the lab teaches/guides/answers.
`mode="evaluate"` → the child is answering a checkpoint question; the LLM judges it and
affirms or gently corrects. Result appended to `event_log`.

### `POST /session/report`
In: `{session_id}`
Out: `{report_text}` — a 4–6 line **teacher** report (English) built from `event_log` by
**Sarvam-105B**: what the child did, what they asked, checkpoint results, and a plain
"understanding" summary. Latency is irrelevant here.

---

## 7. Prompt builders (`backend/prompts.py`)

Keep replies to **1–2 sentences** (latency + it's for a 6-year-old). Build the child-facing
prompt in the child's language.

**Guide prompt (sketch):**
```
You are a friendly science lab guide for a Grade-6 child named {student_name}.
Speak ONLY in {language}. Keep replies to 1–2 short sentences a child understands.
Experiment: {experiment.title} — {experiment.goal}
Current scene state: {scene_state}
Recent conversation: {history}
The child just said: "{transcript}".
If they ask what to do next, guide the current step: {current_step.instruction}
If they ask a concept question, answer simply using: {current_step.concept}
Occasionally, when a step is complete, ask them ONE short check question.
```

**Evaluate prompt (sketch):**
```
You are checking a Grade-6 child's understanding. Speak ONLY in {language}.
The question asked was: "{checkpoint.question}"
Expected idea: "{checkpoint.expected}"
The child answered: "{transcript}".
Decide if the child's idea is roughly correct. Reply in 1–2 sentences:
- If correct: affirm warmly and briefly reinforce why.
- If not: gently correct with the hint: "{checkpoint.hint}". Do not shame.
Then return a one-word verdict for logging: CORRECT or NEEDS_WORK.
```
(Parse the verdict server-side into `event_log`; strip it from the child-facing text.)

**Report prompt (sketch, 105B, English):**
```
You are writing a short report for a teacher about one lab session.
Student: {student_name}. Experiment: {experiment.title}.
Session events (JSON): {event_log}
Write 4–6 lines: steps completed, questions the child asked, checkpoint results,
and a plain-language note on what they understood well and where they struggled.
```

---

## 8. Latency plan (target: perceived < 1s to first audio)

In priority order:
1. **Sarvam-30B for the loop** (not 105B). Biggest lever.
2. **Stream LLM → Bulbul WebSocket TTS** (sub-250ms first byte): start speaking the first
   clause instead of waiting for the whole reply. Optimize time-to-first-*audio*.
   *Build the plain REST version first; add streaming only as a polish pass.*
3. **Cap replies at 1–2 sentences** via the prompt.
4. **Client-side VAD** so ASR fires the instant the child stops talking.
5. **Pre-warm** the pipeline with one throwaway call right before demoing (kill cold start).
6. **Hide residual latency**: a "thinking" beat/animation on the guide character.

**Stage insurance:** the chat path skips ASR/TTS and is near-instant. If wifi is bad, demo
in chat — it's the full experience minus voice.

---

## 9. Build order (never let latency/polish block a working demo)

1. **REST spine:** `/respond` text-only + chemistry config, end to end (curl-testable).
2. **Frontend skeleton:** Home → Setup → Scene(chat) → Report, wired to the spine. *Now a
   full text demo exists.*
3. **3D chemistry scene** (faked walk-up, dialogue card over canvas).
4. **Voice:** Saaras + Bulbul as plain sequential REST (~2s ok).
5. **Streaming TTS** polish pass (LLM stream → Bulbul WS). *Only if time.*
6. **`/session/report`** with 105B.
7. **Generate the other 3 experiment configs** from the chemistry one (content, not code).
8. **Dummy Create-Experiment modal.**

If you run out of time, a flawless step 1–4 + report beats a broken step 1–8.

---

## 10. Repo layout

```
virtual-lab/
  CLAUDE.md            # this file
  AGENTS.md            # symlink → CLAUDE.md (for Codex)
  DESIGN.md            # screens + experiment-config schema
  BUILD_GUIDE.md       # prerequisites + ordered Codex prompts
  backend/
    main.py            # FastAPI app + endpoints
    sarvam.py          # Sarvam ASR / LLM / TTS wrappers (fetch docs for signatures)
    session.py         # in-memory session store + Session model
    prompts.py         # guide / evaluate / report prompt builders
    experiments/
      chemistry_separation.json
      physics_circuit.json
      biology_water.json
      maths_area_perimeter.json
    requirements.txt
    .env               # SARVAM_API_KEY=...  (gitignored)
  frontend/
    index.html
    src/
      main.jsx
      screens/  Home.jsx  Setup.jsx  Scene.jsx  Report.jsx
      scene/    ChemScene.jsx  sceneState.js
      components/ DialogueCard.jsx  MicButton.jsx  CreateExperimentModal.jsx
      lib/      api.js  voice.js   # mic capture, VAD, audio playback
```

---

## 11. Conventions

- Experiments are **data** (`experiments/*.json`), consumed by one engine. Adding a subject
  = adding a JSON file + (optionally) a scene component. See DESIGN.md §"Experiment config".
- Keep `sarvam.py` as thin wrappers: `asr(audio, language) -> text`,
  `llm(messages) -> text` (+ streaming variant), `tts(text, language) -> audio_bytes`
  (+ streaming). All network specifics live here.
- Frontend never calls Sarvam directly — only the FastAPI backend. Keeps the key server-side.
- CORS: allow the Vite dev origin on the FastAPI app.
- Log every action to `event_log` as it happens.