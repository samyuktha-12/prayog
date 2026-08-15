import { useRef, useState } from 'react'
import { isVoiceSupported, startRecording, stopRecording, unlockAudioPlayback } from '../lib/voice.js'

// Press-to-talk, with client-side VAD as a second way to end the turn
// (CLAUDE.md §8 item 4): releasing the button always works, but if the
// child just stops talking and holds on, VAD ends the recording for them.
// If the browser can't record audio at all, render nothing — the text
// input next to it keeps working, which is the silent fallback.
export default function MicButton({ disabled, onRecorded, onError }) {
  const [recording, setRecording] = useState(false)
  const activeRef = useRef(false)
  const finishedRef = useRef(false)

  if (!isVoiceSupported()) return null

  // VAD auto-stop and a manual pointerup can both fire — only the first
  // one should actually finish the recording.
  async function finishRecording() {
    if (finishedRef.current) return
    finishedRef.current = true
    activeRef.current = false
    setRecording(false)
    try {
      const blob = await stopRecording()
      onRecorded(blob)
    } catch (err) {
      onError?.(err)
    }
  }

  async function handleDown(e) {
    e.preventDefault()
    if (disabled || recording) return
    finishedRef.current = false
    try {
      await unlockAudioPlayback()
      await startRecording(finishRecording)
      activeRef.current = true
      setRecording(true)
    } catch (err) {
      onError?.(err)
    }
  }

  function handleUp(e) {
    e.preventDefault()
    if (!activeRef.current) return
    finishRecording()
  }

  return (
    <button
      type="button"
      className={`mic-button${recording ? ' recording' : ''}`}
      disabled={disabled}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={recording ? handleUp : undefined}
      aria-label="Hold to talk"
      title="Hold to talk"
    >
      🎤
    </button>
  )
}
