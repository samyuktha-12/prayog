import { useState } from 'react'
import { startSession, getExperiment } from '../lib/api.js'
import { initialSceneState } from '../scene/sceneState.js'

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
      const [experiment, { session_id, greeting_text }] = await Promise.all([
        getExperiment(session.experiment_id),
        startSession({
          student_name: name,
          language: session.language,
          experiment_id: session.experiment_id,
        }),
      ])
      updateSession({
        student_name: name,
        session_id,
        experiment,
        scene_state: initialSceneState(experiment),
        history: [
          { role: 'guide', text: greeting_text },
          { role: 'guide', text: experiment.steps[0].instruction },
        ],
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
    <div className="page" style={{ '--accent': session.experiment_accent }}>
      <h1>Get Ready</h1>
      {error && <div className="error-banner">{error}</div>}

      {session.experiment_icon && (
        <div className="chip accent">
          <span style={{ fontSize: 20 }}>{session.experiment_icon}</span>
        </div>
      )}

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
