import { useState } from 'react'
import Home from './screens/Home.jsx'
import Setup from './screens/Setup.jsx'
import Scene from './screens/Scene.jsx'
import Report from './screens/Report.jsx'

const SCREENS = { home: Home, setup: Setup, scene: Scene, report: Report }

export default function App() {
  const [screen, setScreen] = useState('home')
  const CurrentScreen = SCREENS[screen]
  return <CurrentScreen navigate={setScreen} />
}
