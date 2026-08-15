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

const GITHUB_REPO_URL = 'https://github.com/samyuktha-12/prayog'

function LabIllustration() {
  return (
    <svg className="lab-illustration" viewBox="0 0 420 260" fill="none" aria-hidden="true">
      <circle cx="335" cy="54" r="34" fill="#FFCD70" opacity=".82" />
      <path d="M0 219C68 187 123 215 176 201C241 183 294 146 420 186V260H0V219Z" fill="#C7F0E4" />
      <path d="M0 231C92 205 141 239 215 212C293 184 351 203 420 187V260H0V231Z" fill="#8ED7C3" opacity=".72" />
      <rect x="39" y="191" width="341" height="18" rx="9" fill="#885B43" />
      <rect x="63" y="207" width="12" height="38" rx="6" fill="#704332" />
      <rect x="342" y="207" width="12" height="38" rx="6" fill="#704332" />
      <path d="M113 88H157L150 121V162C150 177 138 188 123 188C108 188 96 177 96 162V121L89 88H113Z" fill="#EAF7F4" stroke="#23665F" strokeWidth="6" strokeLinejoin="round" />
      <path d="M99 143C111 134 130 150 149 139V162C149 176 138 186 123 186C108 186 98 176 98 162L99 143Z" fill="#35B9A4" />
      <path d="M88 88H158" stroke="#23665F" strokeWidth="6" strokeLinecap="round" />
      <path d="M230 75H267V110L293 158C299 170 290 185 276 185H221C207 185 198 170 204 158L230 110V75Z" fill="#FFF7E6" stroke="#9A6946" strokeWidth="6" strokeLinejoin="round" />
      <path d="M209 151C226 142 251 157 287 147L293 159C299 171 290 185 276 185H221C207 185 198 170 204 159L209 151Z" fill="#FFB04A" />
      <path d="M226 75H271" stroke="#9A6946" strokeWidth="6" strokeLinecap="round" />
      <path d="M332 117V177" stroke="#536173" strokeWidth="7" strokeLinecap="round" />
      <path d="M310 116H355" stroke="#536173" strokeWidth="7" strokeLinecap="round" />
      <path d="M321 143H344L350 177H315L321 143Z" fill="#8A7AF0" stroke="#536173" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="59" cy="75" r="7" fill="#8A7AF0" />
      <circle cx="73" cy="55" r="5" fill="#35B9A4" />
      <circle cx="45" cy="50" r="4" fill="#FFB04A" />
    </svg>
  )
}

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
        <a className="header-github-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.36 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.2-3.37-1.2-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.67.35-1.11.64-1.37-2.22-.26-4.56-1.15-4.56-5.12 0-1.13.39-2.05 1.03-2.77-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.06A9.3 9.3 0 0 1 12 7.1c.85 0 1.7.12 2.5.34 1.9-1.34 2.74-1.06 2.74-1.06.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.77 0 3.98-2.35 4.85-4.59 5.11.36.32.68.93.68 1.88 0 1.36-.01 2.46-.01 2.8 0 .27.18.6.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
          </svg>
          <span>View on GitHub</span>
        </a>
        <div className="user-chip">
          <div className="avatar">A</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aarav · Grade 6</div>
        </div>
      </div>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-copy">
          <div className="hero-kicker">A voice-first science lab</div>
          <h1 id="home-hero-title">Learn science by doing.</h1>
          <p>
            Prayog gives Grade-6 learners guided, hands-on experiments in their own language.
            Ask questions by voice, explore each step, and finish with a teacher-friendly report.
          </p>
        </div>
        <LabIllustration />
      </section>

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

      <footer className="home-footer">
        <span>Built for curious Grade-6 scientists.</span>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.36 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.2-3.37-1.2-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.67.35-1.11.64-1.37-2.22-.26-4.56-1.15-4.56-5.12 0-1.13.39-2.05 1.03-2.77-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.06A9.3 9.3 0 0 1 12 7.1c.85 0 1.7.12 2.5.34 1.9-1.34 2.74-1.06 2.74-1.06.55 1.42.2 2.47.1 2.73.64.72 1.03 1.64 1.03 2.77 0 3.98-2.35 4.85-4.59 5.11.36.32.68.93.68 1.88 0 1.36-.01 2.46-.01 2.8 0 .27.18.6.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
          </svg>
          View the project on GitHub
        </a>
      </footer>
    </div>
  )
}
