import { useEffect, useState } from 'react'
import { getReport } from '../lib/api.js'

export default function Report({ session, resetSession }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getReport({ session_id: session.session_id })
      .then(({ report_text }) => {
        if (!cancelled) setReport(report_text)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the report. Is the backend running?')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session.session_id])

  return (
    <div className="page">
      <h1>Session Report</h1>
      <p>
        {session.student_name} · {session.experiment?.title}
      </p>

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
