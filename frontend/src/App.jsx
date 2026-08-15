import { useState } from 'react'
import Home from './screens/Home.jsx'
import Setup from './screens/Setup.jsx'
import Scene from './screens/Scene.jsx'
import Report from './screens/Report.jsx'

const SCREENS = { home: Home, setup: Setup, scene: Scene, report: Report }

const INITIAL_SESSION = {
  session_id: null,
  student_name: 'Aarav',
  language: 'hi-IN',
  experiment_id: null,
  scene_state: {},
  history: [],
  event_log: [],
}

export default function App() {
  const [screen, setScreen] = useState('home')
  const [session, setSession] = useState(INITIAL_SESSION)

  function updateSession(partial) {
    setSession((s) => ({ ...s, ...partial }))
  }

  function resetSession() {
    setSession(INITIAL_SESSION)
    setScreen('home')
  }

  const CurrentScreen = SCREENS[screen]
  return (
    <CurrentScreen
      session={session}
      updateSession={updateSession}
      navigate={setScreen}
      resetSession={resetSession}
    />
  )
}
