import { useState } from 'react'

// DUMMY generation flow (CLAUDE.md §2 / DESIGN.md §1b). No LLM call, no real
// scene generation — a fake delay followed by a pre-baked card reveal.
export default function CreateExperimentModal({ onClose, onGenerated }) {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState('form') // 'form' | 'generating' | 'done'

  function handleGenerate() {
    setPhase('generating')
    setTimeout(() => {
      onGenerated(name)
      setPhase('done')
    }, 2200)
  }

  return (
    <div className="overlay" onClick={phase === 'generating' ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Create Experiment</div>

        {phase === 'generating' && (
          <div className="modal-generating">
            <div className="modal-spinner" />
            <p>Generating your lab…</p>
          </div>
        )}

        {phase === 'form' && (
          <>
            <input
              className="field"
              placeholder="Experiment name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ margin: 0 }}
            />
            <div className="dropzone">Upload an experiment sheet (PDF)</div>
            <div className="modal-actions">
              <button className="btn-light" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-dark" onClick={handleGenerate}>
                Generate lab
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <div className="modal-done">
            <p>Lab generated! It's been added to your experiments.</p>
            <button className="btn-dark" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
