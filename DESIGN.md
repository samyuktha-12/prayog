# DESIGN.md — Screens, Scene Loop & Experiment Config

Companion to CLAUDE.md. This file describes what to build on the frontend, screen by
screen, and the data schema that makes four experiments run on one engine.

Keep the visual style **clean, warm, child-friendly**: large tap targets, big readable
type, generous spacing, a soft rounded card for dialogue. It should feel like a friendly
game, not a form. One accent color per subject is a nice touch (chem = teal).

---

## Global state (frontend)

A single session object mirrors the backend (CLAUDE.md §5). Screens read/write it:

```js
session = {
  session_id, student_name, language, experiment_id,
  scene_state,   // owned by the scene, posted on every /respond
  history,       // last ~4 turns (for display + sent to backend)
  event_log,     // appended as the child acts (drives the report)
}
```

Screen flow: **Home → (Create modal, dummy) → Setup → Scene → Report → Home**

---

## Screen 1 — Home (Student)

**Purpose:** pick a language and an experiment. No auth.

Contains:
- A hardcoded demo student chip: **"Aarav · Grade 6"**.
- **Language selector** (segmented control): Tamil / Hindi / Kannada. Store as a Sarvam
  language code (confirm codes in docs, e.g. `ta-IN`, `hi-IN`, `kn-IN`).
- A grid of **experiment cards** (from a static list), each showing subject, title, a small
  icon, and subject accent color:
  - Chemistry — Separation of Substances  ← **the live one**
  - Physics — Simple Electric Circuit
  - Biology — Water Conduction in Plants
  - Maths — Area & Perimeter Grid
- A final **"+ Create Experiment"** card → opens the dummy modal (Screen 1b).

Behavior: tapping a card sets `experiment_id` and goes to Setup.
Backend calls: none. Pure frontend.

> Only the Chemistry card leads to a full 3D scene. The others can either open the same
> chat-based scene with their config (no bespoke 3D) or show a "coming soon in this engine"
> state. Decide based on time. The pitch says "same engine, generated from a config."

---

## Screen 1b — Create Experiment (DUMMY modal)

**Purpose:** tell the platform/teacher-authoring story without building the pipeline.

Contains: a text field ("Experiment name"), a fake upload dropzone ("Upload an experiment
sheet (PDF)"), and a **"Generate lab"** button.

Behavior on Generate:
1. Show a convincing **"Generating your lab with Codex…"** progress state (~2–3s, fake).
2. Then either reveal a new pre-baked experiment card in the grid, or show a success toast
   and close.

**Do not** actually call an LLM or generate a scene. This is illusion only. It exists to
make judges believe the engine is extensible by non-coders.

---

## Screen 2 — Setup (Pre-scene)

**Purpose:** personalize the session.

Contains: child's **name** (prefilled "Aarav", editable) and a **confirm language** display.
A big **"Enter the Lab"** button.

Behavior on Enter:
- `POST /session/start {student_name, language, experiment_id}`
- Store `session_id`. Play/show the returned greeting (child's name, in their language).
- Go to Scene.

This is what "the scene is prepared specially for this kid" means: name + language are
injected into the guide's system prompt, so the first thing the child hears is a greeting
by name in their tongue.

---

## Screen 3 — Scene (the heart)

Layout: **3D canvas** (react-three-fiber) filling the screen, with a **dialogue card**
composited at the bottom and a **mic / chat toggle**.

### Visual (chemistry)
A simple lab bench with: a beaker of murky sand+salt+water, a funnel with filter paper, a
burner, an empty dish. **Fake the walk-up**: a fixed camera that dollies toward the bench on
enter — no free-roam, no collisions. Low-poly assets are fine (see BUILD_GUIDE prereqs).

### Dialogue card (over the canvas)
- The guide's latest line (text), with a small speaker/replay icon for the audio.
- A **step indicator** (e.g. "Step 2 of 3").
- Input row: **mic button** (press-to-talk) and a **text input** toggle (chat fallback).
- When a checkpoint fires, the card shows the question and switches the next `/respond`
  call to `mode:"evaluate"`.

### The interaction loop (per step)
1. Guide states the current step's instruction (from config).
2. Child performs the action in the 3D scene (tap the beaker to stir, drag to pour through
   filter, tap burner to heat). Each action applies the step's `state_change` to
   `scene_state` and appends to `event_log`.
3. Child may **ask** anything (voice/chat) → `POST /respond mode:"guide"` with current
   `scene_state`. Guide answers in 1–2 sentences.
4. On step completion, the config may define a **checkpoint** → guide asks the child a
   question. Child answers → `POST /respond mode:"evaluate"`. Verdict logged.
5. Advance to next step. After the last step, enable **"Finish & see report"**.

### Voice specifics (see CLAUDE.md §8)
- Press-to-talk mic (simplest) or VAD auto-stop. Capture audio → send as `input_type:audio`.
- Play returned `reply_audio`. Show a "thinking…" animation on the guide while waiting.
- If voice errors, silently fall back to showing text and the chat input.

---

## Screen 4 — Session Report (Teacher view)

**Purpose:** show the measurable outcome — this is what makes it a learning tool, not a toy.

On entry: `POST /session/report {session_id}` → render `report_text`.

Show, cleanly:
- Header: "Session Report — Aarav · Separation of Substances".
- **Steps completed** (from `event_log`).
- **Questions the child asked** (list).
- **Checkpoints**: each question + CORRECT / NEEDS_WORK.
- **Understanding summary** (the 105B paragraph).
- A "Back to Home" button.

Keep it a plain, printable-looking card. This screen sells the whole idea to a teacher.

---

## Experiment config schema (the key to "4 experiments = 4 files")

One generic schema. The engine reads `steps` (what the child does) and `checkpoints` (what
the lab asks back). All four subjects express in this shape.

```json
{
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
      "state_change": { "mixture": "mixed" },
      "concept": "Salt dissolves in water; sand does not — it stays as tiny bits."
    },
    {
      "id": "filter",
      "instruction": "Pour the mixture slowly through the filter paper.",
      "action": "pour_filter",
      "state_change": { "sand_separated": true },
      "concept": "Filtration traps the insoluble sand and lets the salty water pass."
    },
    {
      "id": "evaporate",
      "instruction": "Heat the filtered water until it all boils away.",
      "action": "heat",
      "state_change": { "water_boiled": true, "salt_visible": true },
      "concept": "Water evaporates and leaves the dissolved salt behind as crystals."
    }
  ],
  "checkpoints": [
    {
      "after_step": "filter",
      "question": "What stayed on the filter paper?",
      "expected": "the sand",
      "hint": "Think about what did not dissolve."
    },
    {
      "after_step": "evaporate",
      "question": "Where did the salt come from when the water disappeared?",
      "expected": "it was dissolved in the water all along",
      "hint": "The salt didn't leave — it was hiding in the water."
    }
  ]
}
```

**Runtime `scene_state`** is just: `{ current_step_id, awaiting_answer, ...accumulated
state_changes }`. The frontend builds it from the config as the child acts, and posts it
each turn.

### The other three configs (generate these, no bespoke 3D required)

- **physics_circuit** — steps: connect wire to battery, connect to bulb, close the circuit
  (bulb lights), test an object for conductivity. Checkpoints: "Will the bulb glow if a wire
  is removed?", "Is the plastic scale a conductor?"
- **biology_water** — steps: put a leafy stem in colored water, wait (fake time slider),
  observe color rise in the stem, cut the stem to see colored tubes. Checkpoint: "How did
  the color reach the top of the plant?"
- **maths_area_perimeter** — steps: draw a shape on a grid, count inside squares (area),
  count border units (perimeter). Checkpoints: "What is the area in squares?", "What is the
  perimeter?" (great for voice-answer evaluation).

All four use the same `/respond` engine. Only chemistry (and maybe physics) get real 3D;
the rest can run in the same dialogue-card UI over a simple 2D/illustrative scene.
