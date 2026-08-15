import { useState } from 'react'
import ChemScene from '../scene/ChemScene.jsx'
import DialogueCard from '../components/DialogueCard.jsx'
import { respond, logAction } from '../lib/api.js'
import {
  CHEMISTRY_EXPERIMENT,
  getCurrentStep,
  getStepIndex,
  getCheckpointForStep,
  applyStepAction,
  applyCheckpointAnswered,
} from '../scene/sceneState.js'

export default function Scene({ session, updateSession, navigate }) {
  const experiment = CHEMISTRY_EXPERIMENT
  const sceneState = session.scene_state
  const currentStep = getCurrentStep(experiment, sceneState)
  const checkpoint = sceneState.awaiting_answer ? getCheckpointForStep(experiment, currentStep.id) : null
  const mode = checkpoint ? 'evaluate' : 'guide'
  const stepIndex = getStepIndex(experiment, currentStep.id)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const lastGuideLine =
    [...session.history].reverse().find((h) => h.role === 'guide')?.text ?? currentStep.instruction

  function pushHistory(entries) {
    return [...session.history, ...entries].slice(-4)
  }

  // Fired by ChemScene once the child completes the current step's tap/drag
  // gesture (stir / pour_filter / heat) — the 3D stand-in for what was
  // previously a placeholder "I've done this" button.
  function handleStepDone() {
    const newSceneState = applyStepAction(sceneState, experiment)
    const nextStep = getCurrentStep(experiment, newSceneState)
    const nextCheckpoint = newSceneState.awaiting_answer
      ? getCheckpointForStep(experiment, nextStep.id)
      : null
    const line = newSceneState.completed
      ? 'You finished the experiment! Tap "Finish & see report" to see how you did.'
      : nextCheckpoint
        ? nextCheckpoint.question
        : nextStep.instruction

    updateSession({
      scene_state: newSceneState,
      history: pushHistory([{ role: 'guide', text: line }]),
      event_log: [
        ...session.event_log,
        { type: 'action', step_id: currentStep.id, action: currentStep.action },
      ],
    })

    // Best-effort: tell the backend's authoritative event_log too, so
    // /session/report can see step completions, not just conversational
    // turns. Local UI already updated regardless of whether this succeeds.
    logAction({
      session_id: session.session_id,
      step_id: currentStep.id,
      action: currentStep.action,
      scene_state: newSceneState,
    }).catch(() => {})
  }

  async function handleSend(text) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    try {
      const { reply_text } = await respond({
        session_id: session.session_id,
        input: trimmed,
        input_type: 'text',
        scene_state: sceneState,
        mode,
      })

      let newSceneState = sceneState
      const newHistoryEntries = [
        { role: 'child', text: trimmed },
        { role: 'guide', text: reply_text },
      ]

      if (mode === 'evaluate') {
        newSceneState = applyCheckpointAnswered(sceneState, experiment)
        if (!newSceneState.completed) {
          const nextStep = getCurrentStep(experiment, newSceneState)
          newHistoryEntries.push({ role: 'guide', text: nextStep.instruction })
        }
      }

      updateSession({
        scene_state: newSceneState,
        history: pushHistory(newHistoryEntries),
        event_log: [
          ...session.event_log,
          { type: mode === 'evaluate' ? 'checkpoint' : 'guide_turn', input: trimmed, reply: reply_text },
        ],
      })
    } catch (e) {
      setError('Could not reach the lab. Check the backend and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scene-stage">
      <ChemScene
        stepAction={currentStep.action}
        sceneState={sceneState}
        disabled={sceneState.awaiting_answer || sceneState.completed}
        onStepAction={handleStepDone}
      />

      <div className="scene-topbar">
        <div className="chip">{experiment.title}</div>
        <button
          className="btn btn-primary btn-small"
          disabled={!sceneState.completed}
          onClick={() => navigate('report')}
        >
          Finish &amp; see report
        </button>
      </div>

      {error && <div className="error-banner scene-error">{error}</div>}

      <DialogueCard
        guideLine={lastGuideLine}
        stepLabel={`Step ${stepIndex + 1} of ${experiment.steps.length}`}
        loading={loading}
        onSend={handleSend}
      />
    </div>
  )
}
