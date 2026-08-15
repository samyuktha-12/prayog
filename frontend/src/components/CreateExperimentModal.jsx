import { useState } from 'react'

// DUMMY generation flow (CLAUDE.md §2 / DESIGN.md §1b). No LLM call, no real
// scene generation — a fake delay followed by a pre-baked card reveal.
export default function CreateExperimentModal({ onClose, onGenerated }) {
  const [name, setName] = useState('')
  const [generating, setGenerating] = useState(false)

  function handleGenerate() {
    setGenerating(true)
    setTimeout(() => onGenerated(name), 2400)
  }

  return (
    <div className="overlay" onClick={generating ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {generating ? (
          <>
            <h2>Generating your lab with Codex…</h2>
            <p>Reading the experiment sheet and building a 3D scene just for this experiment.</p>
          </>
        ) : (
          <>
            <h2>Create Experiment</h2>
            <input
              className="field"
              placeholder="Experiment name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="dropzone">Upload an experiment sheet (PDF)</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleGenerate}>
                Generate lab
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
