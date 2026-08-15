const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`${path} failed (${res.status}): ${detail}`)
  }
  return res.json()
}

export async function getExperiment(experiment_id) {
  const res = await fetch(`${API_BASE}/experiments/${experiment_id}`)
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`/experiments/${experiment_id} failed (${res.status}): ${detail}`)
  }
  return res.json()
}

export function startSession({ student_name, language, experiment_id }) {
  return post('/session/start', { student_name, language, experiment_id })
}

export function respond({ session_id, input, input_type, scene_state, mode }) {
  return post('/respond', { session_id, input, input_type, scene_state, mode })
}

// Streaming twin of respond() for voice turns — reads a newline-delimited
// JSON event stream instead of one JSON body, so audio can start playing
// before the full reply exists (CLAUDE.md §8). Callbacks fire as events
// arrive; the returned promise resolves once the stream ends.
export async function respondStream({ session_id, input, scene_state, mode }, callbacks = {}) {
  const { onTranscript, onTextDelta, onAudioChunk, onDone, onError } = callbacks

  const res = await fetch(`${API_BASE}/respond/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id, input, input_type: 'audio', scene_state, mode }),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`/respond/stream failed (${res.status}): ${detail}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (!line) continue
      const event = JSON.parse(line)
      switch (event.type) {
        case 'transcript':
          onTranscript?.(event.transcript)
          break
        case 'text_delta':
          onTextDelta?.(event.text)
          break
        case 'audio_chunk':
          onAudioChunk?.(event.audio)
          break
        case 'done':
          onDone?.(event.reply_text, event.verdict)
          break
        case 'error':
          onError?.(event.message)
          throw new Error(event.message)
        default:
          break
      }
    }
  }
}

// Flag: flip to false to force the plain, non-streaming /respond voice path
// (CLAUDE.md §9 — never let the polish pass block a working demo).
export const STREAMING_VOICE_ENABLED = true

export function logAction({ session_id, step_id, action, scene_state }) {
  return post('/session/action', { session_id, step_id, action, scene_state })
}

export function getReport({ session_id }) {
  return post('/session/report', { session_id })
}

// Fire-and-forget: kills the Sarvam pipeline's cold-start latency before the
// child's first real turn (CLAUDE.md §8 item 5). Best-effort — errors are
// swallowed so a failed warmup never blocks or shows anything on screen.
export function warmPipeline() {
  return fetch(`${API_BASE}/warmup`, { method: 'POST' }).catch(() => {})
}
