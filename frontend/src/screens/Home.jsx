import { useState } from 'react'
import CreateExperimentModal from '../components/CreateExperimentModal.jsx'

const LANGUAGES = [
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
]

// Static list mirroring backend/experiments/*.json ids. Only chemistry
// gets a bespoke 3D scene; the rest run the same /respond engine and
// DialogueCard UI over GenericScene (DESIGN.md §"Experiment config schema").
const EXPERIMENTS = [
  { id: 'chemistry_separation', subject: 'Chemistry', title: 'Separation of Substances', icon: '🧪', accent: 'oklch(62% 0.11 195)', is3d: true },
  { id: 'physics_circuit', subject: 'Physics', title: 'Simple Electric Circuit', icon: '🔋', accent: 'oklch(62% 0.13 70)', is3d: false },
  { id: 'biology_water', subject: 'Biology', title: 'Water Conduction in Plants', icon: '🌱', accent: 'oklch(58% 0.12 145)', is3d: false },
  { id: 'maths_area_perimeter', subject: 'Maths', title: 'Area & Perimeter Grid', icon: '📐', accent: 'oklch(58% 0.13 305)', is3d: false },
]

export default function Home({ session, updateSession, navigate }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [generatedCards, setGeneratedCards] = useState([])

  function selectExperiment(card) {
    updateSession({ experiment_id: card.id, experiment_accent: card.accent, experiment_icon: card.icon })
    navigate('setup')
  }

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="home-header">
        <div className="brand">Prayog</div>
        <div className="user-chip">
          <div className="avatar">A</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aarav · Grade 6</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 32 }}>
        <div className="section-label">Language</div>
        <div className="segmented">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={session.language === lang.code ? 'active' : ''}
              onClick={() => updateSession({ language: lang.code })}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 }}>
        <div className="section-label">Experiments</div>
        <div className="grid">
          {EXPERIMENTS.map((card) => (
            <button
              key={card.id}
              className="card"
              style={{ '--accent': card.accent }}
              onClick={() => selectExperiment(card)}
            >
              <div className="icon">{card.icon}</div>
              <div>
                <div className="subject">{card.subject}</div>
                <div className="title">{card.title}</div>
              </div>
              {!card.is3d && <div className="caption">Guided scene · no 3D lab yet</div>}
            </button>
          ))}

          {generatedCards.map((card) => (
            <button
              key={card.id}
              className="card"
              style={{ '--accent': card.accent }}
              onClick={() => window.alert('This is a demo preview — full generation coming soon!')}
            >
              <div className="icon">{card.icon}</div>
              <div>
                <div className="subject">{card.subject}</div>
                <div className="title">{card.title}</div>
              </div>
              <div className="caption">Preview</div>
            </button>
          ))}

          <button className="card create" onClick={() => setShowCreateModal(true)}>
            <div className="icon">+</div>
            <div className="title">Create Experiment</div>
          </button>
        </div>
      </div>

      {showCreateModal && (
        <CreateExperimentModal
          onClose={() => setShowCreateModal(false)}
          onGenerated={(name) => {
            setGeneratedCards((cards) => [
              ...cards,
              {
                id: `generated_${cards.length}`,
                subject: 'Custom',
                title: name || 'New Experiment',
                icon: '✨',
                accent: 'oklch(60% 0.11 30)',
              },
            ])
          }}
        />
      )}
    </div>
  )
}
