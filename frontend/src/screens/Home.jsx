import { useState } from 'react'
import CreateExperimentModal from '../components/CreateExperimentModal.jsx'

const LANGUAGES = [
  { code: 'hi-IN', label: 'हिंदी · Hindi' },
  { code: 'ta-IN', label: 'தமிழ் · Tamil' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ · Kannada' },
]

// Static list — only chemistry_separation has a real config + backend
// wiring right now. The rest are "claim, don't build" per CLAUDE.md §2.
const EXPERIMENTS = [
  { id: 'chemistry_separation', subject: 'Chemistry', title: 'Separation of Substances', icon: '🧪', accent: '#2dd4bf', live: true },
  { id: 'physics_circuit', subject: 'Physics', title: 'Simple Electric Circuit', icon: '🔋', accent: '#60a5fa', live: false },
  { id: 'biology_water', subject: 'Biology', title: 'Water Conduction in Plants', icon: '🌱', accent: '#4ade80', live: false },
  { id: 'maths_area_perimeter', subject: 'Maths', title: 'Area & Perimeter Grid', icon: '📐', accent: '#facc15', live: false },
]

export default function Home({ session, updateSession, navigate }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [generatedCards, setGeneratedCards] = useState([])

  function selectExperiment(card) {
    if (!card.live) {
      window.alert(`${card.title} is coming soon in this engine — try Chemistry for the live demo!`)
      return
    }
    updateSession({ experiment_id: card.id })
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
            style={{ borderColor: card.accent, opacity: card.live ? 1 : 0.6 }}
            onClick={() => selectExperiment(card)}
          >
            <div className="icon">{card.icon}</div>
            <div className="subject">{card.subject}</div>
            <div className="title">{card.title}</div>
            {!card.live && <div className="badge">Coming soon</div>}
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
