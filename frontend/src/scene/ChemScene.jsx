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

// Pulsing ring that marks "this is what you can interact with right now" —
// stays visible the whole time a step is actionable (not just on hover) so a
// first-time player has something to aim for without reading instructions;
// brightens and speeds up on hover as direct feedback.
function AffordanceRing({ active, hovered, color = '#2dd4bf', y = 0, radius = 0.55 }) {
  const ref = useRef()

  useFrame((state) => {
    if (!ref.current) return
    if (!active) {
      ref.current.visible = false
      return
    }
    ref.current.visible = true
    const speed = hovered ? 5 : 2.6
    const t = state.clock.elapsedTime
    const pulse = 0.88 + Math.sin(t * speed) * (hovered ? 0.14 : 0.09)
    ref.current.scale.setScalar(pulse)
    ref.current.material.opacity = (hovered ? 0.55 : 0.35) + Math.sin(t * speed) * 0.12
  })

  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.72, radius, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

// One-shot particle burst (splash / sparkle). Idle until `triggerKey`
// changes, then spawns `count` particles at `origin` with outward+gravity
// motion and fades the whole burst out together over `duration`.
function Burst({ triggerKey, origin, color, count = 16, spread = 1, duration = 0.55, gravity = -2 }) {
  const pointsRef = useRef()
  const velocities = useRef([])
  const elapsed = useRef(0)
  const active = useRef(false)
  const positionsArray = useMemo(() => new Float32Array(count * 3), [count])

  useEffect(() => {
    if (!triggerKey || !pointsRef.current) return
    const posAttr = pointsRef.current.geometry.attributes.position
    velocities.current = []
    for (let i = 0; i < count; i++) {
      posAttr.setXYZ(i, origin[0], origin[1], origin[2])
      const angle = Math.random() * Math.PI * 2
      const speed = (0.5 + Math.random() * 0.9) * spread
      velocities.current.push([Math.cos(angle) * speed, Math.random() * spread * 1.4, Math.sin(angle) * speed])
    }
    posAttr.needsUpdate = true
    elapsed.current = 0
    active.current = true
    pointsRef.current.material.opacity = 1
    pointsRef.current.visible = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey])

  useFrame((_, delta) => {
    if (!active.current || !pointsRef.current) return
    elapsed.current += delta
    const t = elapsed.current / duration
    if (t >= 1) {
      active.current = false
      pointsRef.current.visible = false
      return
    }
    const posAttr = pointsRef.current.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      const v = velocities.current[i]
      if (!v) continue
      v[1] += gravity * delta
      posAttr.setXYZ(i, posAttr.getX(i) + v[0] * delta, posAttr.getY(i) + v[1] * delta, posAttr.getZ(i) + v[2] * delta)
    }
    posAttr.needsUpdate = true
    pointsRef.current.material.opacity = 1 - t
  })

  return (
    <points ref={pointsRef} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionsArray, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.05} transparent opacity={0} depthWrite={false} />
    </points>
  )
}

// Grains circling inside the beaker while stirring — sells the "mixing"
// gesture beyond just the rod spinning.
function StirSwirl({ active }) {
  const ref = useRef()
  const count = 14
  const positionsArray = useMemo(() => new Float32Array(count * 3), [])
  const params = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        radius: 0.1 + Math.random() * 0.24,
        angle: Math.random() * Math.PI * 2,
        speed: 3 + Math.random() * 2.5,
        y: -0.28 + Math.random() * 0.18,
      })),
    [],
  )

  useFrame((_, delta) => {
    if (!active || !ref.current) return
    const posAttr = ref.current.geometry.attributes.position
    params.forEach((p, i) => {
      p.angle += p.speed * delta
      posAttr.setXYZ(i, Math.cos(p.angle) * p.radius, p.y, Math.sin(p.angle) * p.radius)
    })
    posAttr.needsUpdate = true
  })

  return (
    <points ref={ref} visible={active}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionsArray, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f5deb3" size={0.032} transparent opacity={0.9} depthWrite={false} />
    </points>
  )
}

// Wisps rising off the dish while it heats.
function Steam({ active }) {
  const ref = useRef()
  const count = 10
  const positionsArray = useMemo(() => new Float32Array(count * 3), [])
  const elapsed = useRef(0)
  const params = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 0.34,
        z: (Math.random() - 0.5) * 0.34,
        offset: Math.random(),
        speed: 0.35 + Math.random() * 0.25,
      })),
    [],
  )

  useFrame((_, delta) => {
    if (!active || !ref.current) return
    elapsed.current += delta
    const posAttr = ref.current.geometry.attributes.position
    params.forEach((p, i) => {
      const t = (elapsed.current * p.speed + p.offset) % 1
      posAttr.setXYZ(i, p.x, 0.55 + t * 0.75, p.z)
    })
    posAttr.needsUpdate = true
  })

  return (
    <points ref={ref} visible={active}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionsArray, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.06} transparent opacity={0.35} depthWrite={false} />
    </points>
  )
}

// Beaker handles two steps: "stir" (click-to-stir the mix) and later
// "pour_filter" (drag-to-tilt-and-pour into the funnel). Same physical
// object, different gesture depending on which step is active.
function Beaker({ stepAction, disabled, mixture, sandSeparated, onAction, onPourStateChange, onSplash }) {
  const groupRef = useRef()
  const rodRef = useRef()
  const tiltTarget = useRef(0)
  const tiltCurrent = useRef(0)
  const dragRef = useRef(null)
  const bounce = useRef(0)
  const [phase, setPhase] = useState('idle') // idle | stirring | pouring | done

  useEffect(() => setPhase('idle'), [stepAction])

  const canStir = !disabled && phase === 'idle' && stepAction === 'stir'
  const canPour = !disabled && phase === 'idle' && stepAction === 'pour_filter'
  const [hovered, setHovered] = useHoverCursor(canStir || canPour)

  function pop() {
    bounce.current = 0.32
  }

  function handleClick(e) {
    if (!canStir) return
    e.stopPropagation()
    setPhase('stirring')
    const timer = setTimeout(() => {
      setPhase('done')
      onAction()
      pop()
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
      onSplash()
      pop()
      tiltTarget.current = 0
      setTimeout(() => setPhase('done'), 500)
    }, 650)
  }

  useFrame((_, delta) => {
    tiltCurrent.current += (tiltTarget.current - tiltCurrent.current) * Math.min(delta * 6, 1)
    bounce.current += (0 - bounce.current) * Math.min(delta * 9, 1)
    if (groupRef.current) {
      groupRef.current.rotation.z = -tiltCurrent.current
      const s = 1 + bounce.current
      groupRef.current.scale.set(s, s, s)
    }
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
        <meshStandardMaterial
          color="#cfe8ff"
          transparent
          opacity={0.28}
          side={DoubleSide}
          emissive={hovered ? '#2dd4bf' : '#000000'}
          emissiveIntensity={hovered ? 0.35 : 0}
        />
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
      <StirSwirl active={phase === 'stirring'} />
      <AffordanceRing active={canStir || canPour} hovered={hovered} color="#2dd4bf" y={-0.49} radius={0.5} />
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
  const groupRef = useRef()
  const bounce = useRef(0)
  const prevSeparated = useRef(sandSeparated)

  useEffect(() => {
    if (sandSeparated && !prevSeparated.current) bounce.current = 0.28
    prevSeparated.current = sandSeparated
  }, [sandSeparated])

  useFrame((_, delta) => {
    bounce.current += (0 - bounce.current) * Math.min(delta * 9, 1)
    if (groupRef.current) {
      const s = 1 + bounce.current
      groupRef.current.scale.set(s, s, s)
    }
  })

  return (
    <group ref={groupRef} position={[0.2, 1, 0]}>
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
  const groupRef = useRef()
  const [phase, setPhase] = useState('idle') // idle | heating | done
  const flameRef = useRef()
  const liquidRef = useRef()
  const bounce = useRef(0)
  const [sparkleTrigger, setSparkleTrigger] = useState(0)
  const prevSaltVisible = useRef(saltVisible)

  useEffect(() => setPhase('idle'), [stepAction])

  useEffect(() => {
    if (saltVisible && !prevSaltVisible.current) setSparkleTrigger((t) => t + 1)
    prevSaltVisible.current = saltVisible
  }, [saltVisible])

  const canHeat = !disabled && phase === 'idle' && stepAction === 'heat'
  const [hovered, setHovered] = useHoverCursor(canHeat)

  function handleClick(e) {
    if (!canHeat) return
    e.stopPropagation()
    setPhase('heating')
    setTimeout(() => {
      setPhase('done')
      onAction()
      bounce.current = 0.32
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
    bounce.current += (0 - bounce.current) * Math.min(delta * 9, 1)
    if (groupRef.current) {
      const s = 1 + bounce.current
      groupRef.current.scale.set(s, s, s)
    }
  })

  return (
    <group ref={groupRef} position={[0.2, 0, 0]}>
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
      <mesh
        position={[0, 0.36, 0]}
        castShadow
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry args={[0.32, 0.28, 0.12, 24]} />
        <meshStandardMaterial
          color="#e5e7eb"
          emissive={hovered ? '#f97316' : '#000000'}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
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
      <Steam active={showFlame} />
      <Burst triggerKey={sparkleTrigger} origin={[0, 0.46, 0]} color="#ffffff" count={12} spread={0.5} duration={0.5} gravity={-0.6} />
      <AffordanceRing active={canHeat} hovered={hovered} color="#f97316" y={0.01} radius={0.5} />
    </group>
  )
}

export default function ChemScene({ stepAction, sceneState, disabled, onStepAction }) {
  const [pouring, setPouring] = useState(false)
  const [splashTrigger, setSplashTrigger] = useState(0)
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
        onSplash={() => setSplashTrigger((t) => t + 1)}
      />
      <Funnel sandSeparated={sandSeparated} />
      <PourStream visible={pouring} />
      <Burst triggerKey={splashTrigger} origin={[0.2, 0.95, 0]} color="#cfe3f5" count={16} spread={1.1} duration={0.5} gravity={-2.4} />
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
