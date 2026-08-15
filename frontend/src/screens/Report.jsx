import { useEffect, useState } from 'react'
import { getReport } from '../lib/api.js'

export default function Report({ session, resetSession }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getReport({
      session_id: session.session_id,
      session_context: {
        student_name: session.student_name,
        language: session.language,
        experiment_id: session.experiment_id,
        scene_state: session.scene_state,
        history: session.history,
        event_log: session.event_log,
      },
    })
      .then(({ report_text }) => {
        if (!cancelled) setReport(report_text)
      })
      .catch((e) => {
        const detail = e instanceof Error ? e.message : 'Unknown report error'
        if (!cancelled) setError(`Could not load the report: ${detail}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session.session_id])

  const totalSteps = session.experiment?.steps?.length ?? 0
  const stepsCompleted = session.event_log.filter((e) => e.type === 'action').length
  const questionsAsked = session.event_log.filter((e) => e.type === 'guide_turn').length
  const checkpointsAnswered = session.event_log.filter((e) => e.type === 'checkpoint').length

  return (
    <div className="page" style={{ '--accent': session.experiment_accent }}>
      <div className="report-header">
        <div className="icon-badge">{session.experiment_icon ?? '📋'}</div>
        <div>
          <h1 style={{ margin: 0 }}>Session Report</h1>
          <div className="subtitle">
            {session.student_name} · {session.experiment?.title}
          </div>
        </div>
      </div>

      <div className="stat-row">
        <span className="stat-chip">✅ {stepsCompleted}/{totalSteps} steps completed</span>
        <span className="stat-chip">💬 {questionsAsked} questions asked</span>
        <span className="stat-chip">🎯 {checkpointsAnswered} checkpoints answered</span>
      </div>

      {loading && <p>Building the report…</p>}
      {error && <div className="error-banner">{error}</div>}
      {report && <div className="report-card">{report}</div>}

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={resetSession}>
          Back to Home
        </button>
      </div>
    </div>
  )
}
