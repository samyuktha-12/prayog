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

export function startSession({ student_name, language, experiment_id }) {
  return post('/session/start', { student_name, language, experiment_id })
}

export function respond({ session_id, input, input_type, scene_state, mode }) {
  return post('/respond', { session_id, input, input_type, scene_state, mode })
}

export function logAction({ session_id, step_id, action, scene_state }) {
  return post('/session/action', { session_id, step_id, action, scene_state })
}

export function getReport({ session_id }) {
  return post('/session/report', { session_id })
}
