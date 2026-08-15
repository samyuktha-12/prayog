import { useRef, useState } from 'react'
import { isVoiceSupported, startRecording, stopRecording } from '../lib/voice.js'

// Press-to-talk. If the browser can't record audio at all, render nothing —
// the text input next to it keeps working, which is the silent fallback.
export default function MicButton({ disabled, onRecorded, onError }) {
  const [recording, setRecording] = useState(false)
  const activeRef = useRef(false)

  if (!isVoiceSupported()) return null

  async function handleDown(e) {
    e.preventDefault()
    if (disabled || recording) return
    try {
      await startRecording()
      activeRef.current = true
      setRecording(true)
    } catch (err) {
      onError?.(err)
    }
  }

  async function handleUp(e) {
    e.preventDefault()
    if (!activeRef.current) return
    activeRef.current = false
    setRecording(false)
    try {
      const blob = await stopRecording()
      onRecorded(blob)
    } catch (err) {
      onError?.(err)
    }
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
