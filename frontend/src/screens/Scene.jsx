import { useEffect, useState } from 'react'
import ChemScene from '../scene/ChemScene.jsx'
import GenericScene from '../scene/GenericScene.jsx'
import DialogueCard from '../components/DialogueCard.jsx'
import { respond, respondStream, logAction, warmPipeline, STREAMING_VOICE_ENABLED } from '../lib/api.js'
import { blobToBase64, playAudioFromBase64, AudioQueue } from '../lib/voice.js'
import {
  getCurrentStep,
  getStepIndex,
  getCheckpointForStep,
  applyStepAction,
  applyCheckpointAnswered,
} from '../scene/sceneState.js'

export default function Scene({ session, updateSession, navigate }) {
  const experiment = session.experiment
  const sceneState = session.scene_state
  const currentStep = getCurrentStep(experiment, sceneState)
  const checkpoint = sceneState.awaiting_answer ? getCheckpointForStep(experiment, currentStep.id) : null
  const mode = checkpoint ? 'evaluate' : 'guide'
  const stepIndex = getStepIndex(experiment, currentStep.id)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fire once as the scene mounts, before the child says anything — kills
  // the Sarvam pipeline's cold-start latency on the first real turn
  // (CLAUDE.md §8 item 5). Best-effort: warmPipeline() swallows its own
  // errors, so a failure here never blocks the demo.
  useEffect(() => {
    warmPipeline()
  }, [])

  const lastGuideLine =
    [...session.history].reverse().find((h) => h.role === 'guide')?.text ?? currentStep.instruction

  function pushHistory(entries) {
    return [...session.history, ...entries].slice(-4)
  }

  function sessionContext() {
    return {
      student_name: session.student_name,
      language: session.language,
      experiment_id: session.experiment_id,
      scene_state: sceneState,
      history: session.history,
      event_log: session.event_log,
    }
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

  // Shared tail end of a /respond turn, used by both the text and voice
  // paths — same brain, per CLAUDE.md §4. Only the non-streaming voice path
  // passes reply_audio here; the streaming path already played its audio
  // chunk-by-chunk as it arrived, so it passes null.
  function applyRespondResult({ transcript, reply_text, reply_audio }) {
    let newSceneState = sceneState
    const newHistoryEntries = [
      { role: 'child', text: transcript },
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
        { type: mode === 'evaluate' ? 'checkpoint' : 'guide_turn', input: transcript, reply: reply_text },
      ],
    })

    if (reply_audio) {
      playAudioFromBase64(reply_audio).catch(() => {})
    }
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
        session_context: sessionContext(),
      })
      applyRespondResult({ transcript: trimmed, reply_text, reply_audio: null })
    } catch (e) {
      setError('Could not reach the lab. Check the backend and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVoiceSendStreaming(base64Audio) {
    const queue = new AudioQueue()
    let finalReplyText = ''
    let finalTranscript = ''

    await respondStream(
      {
        session_id: session.session_id,
        input: base64Audio,
        scene_state: sceneState,
        mode,
      },
      {
        onTranscript: (t) => {
          finalTranscript = t
        },
        onAudioChunk: (chunk) => queue.enqueue(chunk),
        onDone: (replyText) => {
          finalReplyText = replyText
        },
      },
    )

    applyRespondResult({
      transcript: finalTranscript || '(voice message)',
      reply_text: finalReplyText,
      reply_audio: null, // already streamed to the AudioQueue as it arrived
    })
  }

  async function handleVoiceSendNonStreaming(base64Audio) {
    const { reply_text, reply_audio, transcript } = await respond({
      session_id: session.session_id,
      input: base64Audio,
      input_type: 'audio',
      scene_state: sceneState,
      mode,
      session_context: sessionContext(),
    })
    applyRespondResult({ transcript: transcript || '(voice message)', reply_text, reply_audio })
  }

  async function handleVoiceSend(blob) {
    if (loading) return
    setLoading(true)
    try {
      const base64Audio = await blobToBase64(blob)
      if (STREAMING_VOICE_ENABLED) {
        try {
          await handleVoiceSendStreaming(base64Audio)
        } catch (e) {
          // Streaming can fail mid-turn in ways plain REST can't (partial
          // events, dropped connection). Fall back to the full non-streaming
          // path rather than losing the turn — still silent to the child.
          console.warn('Streaming voice failed, falling back to non-streaming /respond:', e)
          await handleVoiceSendNonStreaming(base64Audio)
        }
      } else {
        await handleVoiceSendNonStreaming(base64Audio)
      }
    } catch (e) {
      console.warn('Voice turn failed, falling back to text:', e)
      const detail = e instanceof Error ? e.message : 'Unknown voice-processing error'
      setError(`Voice could not be processed: ${detail}`)
    } finally {
      setLoading(false)
    }
  }

  function handleMicError(err) {
    console.warn('Mic capture failed, falling back to text:', err)
    setError('Microphone access failed. Allow the microphone in your browser settings, then try again.')
  }

  return (
    <div className="scene-stage" style={{ '--accent': experiment.accent }}>
      {experiment.id === 'chemistry_separation' ? (
        <ChemScene
          stepAction={currentStep.action}
          sceneState={sceneState}
          disabled={sceneState.awaiting_answer || sceneState.completed}
          onStepAction={handleStepDone}
        />
      ) : (
        <GenericScene
          experiment={experiment}
          currentStep={currentStep}
          disabled={sceneState.awaiting_answer || sceneState.completed}
          onStepAction={handleStepDone}
        />
      )}

      <div className="scene-topbar">
        <div className="chip accent">{experiment.title}</div>
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
        stepIndex={stepIndex}
        totalSteps={experiment.steps.length}
        loading={loading}
        onSend={handleSend}
        onRecordedAudio={handleVoiceSend}
        onMicError={handleMicError}
      />
    </div>
  )
}
