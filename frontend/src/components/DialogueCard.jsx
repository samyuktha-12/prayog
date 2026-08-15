import { useState } from 'react'
import MicButton from './MicButton.jsx'

export default function DialogueCard({
  guideLine,
  stepLabel,
  stepIndex,
  totalSteps,
  loading,
  onSend,
  onRecordedAudio,
  onMicError,
}) {
  const [text, setText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || loading) return
    onSend(text)
    setText('')
  }

  return (
    <div className="dialogue-card">
      <div className="step-indicator">
        <span className="step-label">{stepLabel}</span>
        {Number.isInteger(totalSteps) && (
          <div className="step-dots">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span key={i} className={`step-dot${i < stepIndex ? ' done' : i === stepIndex ? ' current' : ''}`} />
            ))}
          </div>
        )}
      </div>
      <div className="guide-line">{loading ? 'Thinking…' : guideLine}</div>
      <form className="input-row" onSubmit={handleSubmit}>
        <MicButton disabled={loading} onRecorded={onRecordedAudio} onError={onMicError} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question, or hold the mic to talk…"
          disabled={loading}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
