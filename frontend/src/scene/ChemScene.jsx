import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { DoubleSide } from 'three'

// Fixed camera dolly-in on mount. No OrbitControls, no free-roam, no
// collisions — just a scripted lerp from a wide establishing shot to the
// final bench-side framing (DESIGN.md Screen 3: "fake the walk-up").
function CameraDolly() {
  const { camera } = useThree()
  const start = useRef([0, 3.6, 9])
  const end = useRef([0, 1.6, 4.8])
  const t = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    camera.position.set(...start.current)
    camera.lookAt(0, 0.4, 0)
  }, [camera])

  useFrame((_, delta) => {
    if (done.current) return
    t.current = Math.min(t.current + delta / 1.8, 1)
    const ease = 1 - Math.pow(1 - t.current, 3)
    camera.position.set(
      start.current[0] + (end.current[0] - start.current[0]) * ease,
      start.current[1] + (end.current[1] - start.current[1]) * ease,
      start.current[2] + (end.current[2] - start.current[2]) * ease,
    )
    camera.lookAt(0, 0.4, 0)
    if (t.current >= 1) done.current = true
  })

  return null
}

function Bench() {
  return (
    <>
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#eef4ef" />
      </mesh>
      <mesh position={[0, -0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[6, 0.3, 2.4]} />
        <meshStandardMaterial color="#a9764f" />
      </mesh>
    </>
  )
}

function useHoverCursor(active) {
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hovered && active ? 'pointer' : 'auto'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [hovered, active])
  return [hovered, setHovered]
}

// Beaker handles two steps: "stir" (click-to-stir the mix) and later
// "pour_filter" (drag-to-tilt-and-pour into the funnel). Same physical
// object, different gesture depending on which step is active.
function Beaker({ stepAction, disabled, mixture, sandSeparated, onAction, onPourStateChange }) {
  const groupRef = useRef()
  const rodRef = useRef()
  const tiltTarget = useRef(0)
  const tiltCurrent = useRef(0)
  const dragRef = useRef(null)
  const [phase, setPhase] = useState('idle') // idle | stirring | pouring | done

  useEffect(() => setPhase('idle'), [stepAction])

  const canStir = !disabled && phase === 'idle' && stepAction === 'stir'
  const canPour = !disabled && phase === 'idle' && stepAction === 'pour_filter'
  const [hovered, setHovered] = useHoverCursor(canStir || canPour)

  function handleClick(e) {
    if (!canStir) return
    e.stopPropagation()
    setPhase('stirring')
    const timer = setTimeout(() => {
      setPhase('done')
      onAction()
    }, 1400)
    return () => clearTimeout(timer)
  }

  function handlePointerDown(e) {
    if (!canPour) return
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startY: e.clientY, dist: 0 }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    dragRef.current.dist = Math.hypot(dx, dy)
    tiltTarget.current = Math.min(dragRef.current.dist / 120, 1) * 0.55
  }

  function handlePointerUp() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    const dist = dragRef.current?.dist ?? 0
    dragRef.current = null
    if (dist > 60) {
      startPour()
    } else {
      tiltTarget.current = 0
    }
  }

  function startPour() {
    setPhase('pouring')
    tiltTarget.current = 0.9
    onPourStateChange(true)
    setTimeout(() => {
      onAction()
      onPourStateChange(false)
      tiltTarget.current = 0
      setTimeout(() => setPhase('done'), 500)
    }, 650)
  }

  useFrame((_, delta) => {
    tiltCurrent.current += (tiltTarget.current - tiltCurrent.current) * Math.min(delta * 6, 1)
    if (groupRef.current) groupRef.current.rotation.z = -tiltCurrent.current
    if (phase === 'stirring' && rodRef.current) {
      rodRef.current.rotation.y += delta * 8
    }
  })

  const showLiquid = !sandSeparated
  const liquidColor = mixture === 'mixed' ? '#7c6a4f' : '#cfe3f5'

  return (
    <group
      ref={groupRef}
      position={[-1.9, 0.5, 0]}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.42, 0.32, 1, 24, 1, true]} />
        <meshStandardMaterial color="#cfe8ff" transparent opacity={0.28} side={DoubleSide} />
      </mesh>
      {showLiquid && (
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.38, 0.3, 0.5, 24]} />
          <meshStandardMaterial color={liquidColor} transparent opacity={0.92} />
        </mesh>
      )}
      {phase === 'stirring' && (
        <mesh ref={rodRef} position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
          <meshStandardMaterial color="#8b5e3c" />
        </mesh>
      )}
    </group>
  )
}

function PourStream({ visible }) {
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    const target = visible ? 1 : 0
    ref.current.scale.y += (target - ref.current.scale.y) * 0.3
    ref.current.visible = ref.current.scale.y > 0.02
  })
  return (
    <mesh ref={ref} position={[0.2, 1.15, 0]} scale={[1, 0, 1]} visible={false}>
      <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
      <meshStandardMaterial color="#8a7355" transparent opacity={0.85} />
    </mesh>
  )
}

function Funnel({ sandSeparated }) {
  return (
    <group position={[0.2, 1, 0]}>
      <mesh position={[0.55, -0.45, -0.15]}>
        <cylinderGeometry args={[0.02, 0.02, 1.1, 8]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      <mesh rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[0.4, 0.5, 24, 1, true]} />
        <meshStandardMaterial color="#dfe7ee" transparent opacity={0.5} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.03, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.35, 0.44, 24, 1, true]} />
        <meshStandardMaterial color="#fdf6e3" side={DoubleSide} />
      </mesh>
      {sandSeparated && (
        <mesh position={[0, 0.14, 0]}>
          <coneGeometry args={[0.28, 0.14, 20]} />
          <meshStandardMaterial color="#c2a469" />
        </mesh>
      )}
    </group>
  )
}

function BurnerDish({ stepAction, disabled, sandSeparated, waterBoiled, saltVisible, onAction }) {
  const [phase, setPhase] = useState('idle') // idle | heating | done
  const flameRef = useRef()
  const liquidRef = useRef()

  useEffect(() => setPhase('idle'), [stepAction])

  const canHeat = !disabled && phase === 'idle' && stepAction === 'heat'
  const [hovered, setHovered] = useHoverCursor(canHeat)

  function handleClick(e) {
    if (!canHeat) return
    e.stopPropagation()
    setPhase('heating')
    setTimeout(() => {
      setPhase('done')
      onAction()
    }, 2200)
  }

  const showLiquid = sandSeparated && !waterBoiled
  const showFlame = phase === 'heating'

  const saltCrystals = useMemo(
    () => Array.from({ length: 10 }, () => [(Math.random() - 0.5) * 0.32, (Math.random() - 0.5) * 0.32]),
    [],
  )

  useFrame((state, delta) => {
    if (showFlame && flameRef.current) {
      const t = state.clock.elapsedTime
      flameRef.current.scale.setScalar(0.85 + Math.sin(t * 14) * 0.15)
    }
    if (liquidRef.current) {
      const target = showLiquid ? 1 : 0
      liquidRef.current.scale.y += (target - liquidRef.current.scale.y) * Math.min(delta * 2, 1)
    }
  })

  return (
    <group position={[0.2, 0, 0]}>
      <mesh
        position={[0, 0.15, 0]}
        castShadow
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry args={[0.35, 0.4, 0.3, 20]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      {showFlame && (
        <mesh ref={flameRef} position={[0, 0.42, 0]}>
          <coneGeometry args={[0.16, 0.35, 12]} />
          <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.2} />
        </mesh>
      )}
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.28, 0.12, 24]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh ref={liquidRef} position={[0, 0.44, 0]} scale={[1, 0, 1]}>
        <cylinderGeometry args={[0.27, 0.27, 0.22, 24]} />
        <meshStandardMaterial color="#f0e6bd" transparent opacity={0.85} />
      </mesh>
      {saltVisible && (
        <group position={[0, 0.43, 0]}>
          {saltCrystals.map(([x, z], i) => (
            <mesh key={i} position={[x, 0, z]}>
              <boxGeometry args={[0.03, 0.03, 0.03]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

export default function ChemScene({ stepAction, sceneState, disabled, onStepAction }) {
  const [pouring, setPouring] = useState(false)
  const { mixture, sand_separated: sandSeparated, water_boiled: waterBoiled, salt_visible: saltVisible } = sceneState

  return (
    <Canvas shadows camera={{ fov: 45 }}>
      <color attach="background" args={['#eaf4f4']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={0.9} castShadow />
      <CameraDolly />
      <Bench />
      <Beaker
        stepAction={stepAction}
        disabled={disabled}
        mixture={mixture}
        sandSeparated={sandSeparated}
        onAction={onStepAction}
        onPourStateChange={setPouring}
      />
      <Funnel sandSeparated={sandSeparated} />
      <PourStream visible={pouring} />
      <BurnerDish
        stepAction={stepAction}
        disabled={disabled}
        sandSeparated={sandSeparated}
        waterBoiled={waterBoiled}
        saltVisible={saltVisible}
        onAction={onStepAction}
      />
    </Canvas>
  )
}
