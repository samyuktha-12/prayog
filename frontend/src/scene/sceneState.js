// Mirrors backend/experiments/chemistry_separation.json. No live 3D scene
// yet, so this is what drives step/checkpoint progression for the
// text-only Scene screen. scene_state is owned by the frontend (CLAUDE.md
// §4) and posted to /respond on every turn.

export const CHEMISTRY_EXPERIMENT = {
  id: 'chemistry_separation',
  title: 'Separation of Substances',
  steps: [
    {
      id: 'mix',
      instruction: 'Add the sand and salt to the water and stir well.',
      action: 'stir',
      state_change: { mixture: 'mixed' },
    },
    {
      id: 'filter',
      instruction: 'Pour the mixture slowly through the filter paper.',
      action: 'pour_filter',
      state_change: { sand_separated: true },
    },
    {
      id: 'evaporate',
      instruction: 'Heat the filtered water until it all boils away.',
      action: 'heat',
      state_change: { water_boiled: true, salt_visible: true },
    },
  ],
  checkpoints: [
    { after_step: 'filter', question: 'What stayed on the filter paper?' },
    { after_step: 'evaporate', question: 'Where did the salt come from when the water disappeared?' },
  ],
}

export function initialSceneState(experiment) {
  return { current_step_id: experiment.steps[0].id, awaiting_answer: false, completed: false }
}

export function getStepIndex(experiment, stepId) {
  return experiment.steps.findIndex((s) => s.id === stepId)
}

export function getCurrentStep(experiment, sceneState) {
  return experiment.steps.find((s) => s.id === sceneState.current_step_id) ?? experiment.steps[0]
}

export function getCheckpointForStep(experiment, stepId) {
  return experiment.checkpoints.find((c) => c.after_step === stepId) ?? null
}

function nextStepId(experiment, stepId) {
  const idx = getStepIndex(experiment, stepId)
  return experiment.steps[idx + 1]?.id ?? null
}

function advanceStep(sceneState, experiment, fromStepId) {
  const next = nextStepId(experiment, fromStepId)
  if (!next) return { ...sceneState, completed: true }
  return { ...sceneState, current_step_id: next }
}

// Child performed the current step's action — stand-in for a 3D tap/drag
// until the real scene exists. Applies the step's state_change and either
// arms the checkpoint or advances straight to the next step.
export function applyStepAction(sceneState, experiment) {
  const step = getCurrentStep(experiment, sceneState)
  const merged = { ...sceneState, ...step.state_change }
  const checkpoint = getCheckpointForStep(experiment, step.id)
  return checkpoint ? { ...merged, awaiting_answer: true } : advanceStep(merged, experiment, step.id)
}

// Child answered the active checkpoint and /respond has judged it.
export function applyCheckpointAnswered(sceneState, experiment) {
  const step = getCurrentStep(experiment, sceneState)
  return advanceStep({ ...sceneState, awaiting_answer: false }, experiment, step.id)
}
