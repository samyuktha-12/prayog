import { useState } from 'react'
import CreateExperimentModal from '../components/CreateExperimentModal.jsx'

const LANGUAGES = [
  { code: 'hi-IN', label: 'हिंदी · Hindi' },
  { code: 'ta-IN', label: 'தமிழ் · Tamil' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ · Kannada' },
]

// Static list mirroring backend/experiments/*.json ids. Only chemistry
// gets a bespoke 3D scene; the rest run the same /respond engine and
// DialogueCard UI over GenericScene (DESIGN.md §"Experiment config schema").
const EXPERIMENTS = [
  { id: 'chemistry_separation', subject: 'Chemistry', title: 'Separation of Substances', icon: '🧪', accent: '#2dd4bf' },
  { id: 'physics_circuit', subject: 'Physics', title: 'Simple Electric Circuit', icon: '🔋', accent: '#60a5fa' },
  { id: 'biology_water', subject: 'Biology', title: 'Water Conduction in Plants', icon: '🌱', accent: '#4ade80' },
  { id: 'maths_area_perimeter', subject: 'Maths', title: 'Area & Perimeter Grid', icon: '📐', accent: '#facc15' },
]

export default function Home({ session, updateSession, navigate }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [generatedCards, setGeneratedCards] = useState([])

  function selectExperiment(card) {
    updateSession({ experiment_id: card.id, experiment_accent: card.accent, experiment_icon: card.icon })
    navigate('setup')
  }

  return (
    <div className="page">
      <div className="chip">Aarav · Grade 6</div>
      <h1>Virtual Science Lab</h1>

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

      <div className="grid">
        {EXPERIMENTS.map((card) => (
          <button
            key={card.id}
            className="card"
            style={{ borderColor: card.accent }}
            onClick={() => selectExperiment(card)}
          >
            <div className="icon">{card.icon}</div>
            <div className="subject">{card.subject}</div>
            <div className="title">{card.title}</div>
          </button>
        ))}

        {generatedCards.map((card) => (
          <button
            key={card.id}
            className="card"
            style={{ borderColor: card.accent, opacity: 0.75 }}
            onClick={() => window.alert('This is a demo preview — full generation coming soon!')}
          >
            <div className="icon">{card.icon}</div>
            <div className="subject">{card.subject}</div>
            <div className="title">{card.title}</div>
            <div className="badge">Preview</div>
          </button>
        ))}

        <button className="card create" onClick={() => setShowCreateModal(true)}>
          <div className="icon">+</div>
          <div>Create Experiment</div>
        </button>
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
                accent: '#a78bfa',
              },
            ])
            setShowCreateModal(false)
          }}
        />
      )}
    </div>
  )
}
