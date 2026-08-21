import { useEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTheme } from '../context/ThemeContext'
import useLiveAccentColor from '../hooks/useLiveAccentColor'

function useReducedMotionRef() {
  const { reduceMotion } = useTheme()
  const ref = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    function update() {
      ref.current = reduceMotion || mq.matches
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [reduceMotion])

  return ref
}

// Pointer position lives in a ref, not React state — useFrame runs ~60x/sec
// and routing per-mousemove data through state would cause a re-render every
// frame.
function usePointerRef() {
  const ref = useRef({ x: 0, y: 0 })
  useEffect(() => {
    function handleMove(e) {
      ref.current.x = (e.clientX / window.innerWidth) * 2 - 1
      ref.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])
  return ref
}

function Blob() {
  const groupRef = useRef(null)
  const meshRef = useRef(null)
  const materialRef = useRef(null)
  const accent = useLiveAccentColor()
  const reducedRef = useReducedMotionRef()
  const pointerRef = usePointerRef()

  // Material color is imperative (three.js Color, not a CSS var) — re-set it
  // whenever the live accent (theme or custom palette) changes.
  useEffect(() => {
    materialRef.current?.color.set(accent.trim())
  }, [accent])

  useFrame((_state, delta) => {
    if (meshRef.current && !reducedRef.current) {
      meshRef.current.rotation.y += delta * 0.2
    }
    // Pointer tilt lives on a separate group/axis pair from the continuous
    // spin so the two motions don't fight over the same rotation values.
    if (groupRef.current) {
      const targetTiltX = pointerRef.current.y * 0.2
      const targetTiltZ = -pointerRef.current.x * 0.2
      groupRef.current.rotation.x += (targetTiltX - groupRef.current.rotation.x) * 0.03
      groupRef.current.rotation.z += (targetTiltZ - groupRef.current.rotation.z) * 0.03
    }
  })

  return (
    // Offset to one side so it reads as a decorative accent rather than
    // competing with the centered auth card, and kept small + translucent
    // (transparent material) so it stays ambient, not a solid color wall.
    <group ref={groupRef} position={[1.8, -0.4, 0]}>
      <mesh ref={meshRef}>
        {/* detail=1 with smooth (non-flat) shading already reads soft/glassy
            — higher subdivision costs more for no visible gain here. */}
        <icosahedronGeometry args={[0.85, 1]} />
        <meshStandardMaterial
          ref={materialRef}
          color={accent}
          roughness={0.35}
          metalness={0.15}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  )
}

export default function AmbientScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 6], fov: 35 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.7} />
      {/* Lit from the top-left, matching the neomorphic shadow direction
          used throughout the 2D UI (index.css's 6px/-6px shadow pairs). */}
      <directionalLight position={[-3, 3, 4]} intensity={1.2} />
      <Blob />
    </Canvas>
  )
}
