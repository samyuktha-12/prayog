import { useState } from 'react'
import { startSession } from '../lib/api.js'
import { CHEMISTRY_EXPERIMENT, initialSceneState } from '../scene/sceneState.js'

const LANGUAGE_LABELS = {
  'hi-IN': 'हिंदी · Hindi',
  'ta-IN': 'தமிழ் · Tamil',
  'kn-IN': 'ಕನ್ನಡ · Kannada',
}

export default function Setup({ session, updateSession, navigate }) {
  const [name, setName] = useState(session.student_name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleEnter() {
    setLoading(true)
    setError(null)
    try {
      const { session_id, greeting_text } = await startSession({
        student_name: name,
        language: session.language,
        experiment_id: session.experiment_id,
      })
      updateSession({
        student_name: name,
        session_id,
        scene_state: initialSceneState(CHEMISTRY_EXPERIMENT),
        history: [{ role: 'guide', text: greeting_text }],
        event_log: [],
      })
      navigate('scene')
    } catch (e) {
      setError('Could not start the session. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>Get Ready</h1>
      {error && <div className="error-banner">{error}</div>}

      <label>
        Name
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="chip">Language: {LANGUAGE_LABELS[session.language] ?? session.language}</div>

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" onClick={handleEnter} disabled={loading || !name.trim()}>
          {loading ? 'Preparing your lab…' : 'Enter the Lab'}
        </button>
      </div>
    </div>
  )
}
