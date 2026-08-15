import { useState } from 'react'

export default function DialogueCard({ guideLine, stepLabel, loading, onSend }) {
  const [text, setText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || loading) return
    onSend(text)
    setText('')
  }

  return (
    <div className="dialogue-card">
      <div className="step-indicator">{stepLabel}</div>
      <div className="guide-line">{loading ? 'Thinking…' : guideLine}</div>
      <form className="input-row" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question or answer here…"
          disabled={loading}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
