import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from '../context/ThemeContext'
import useLiveAccentColor from '../hooks/useLiveAccentColor'

// The frontispiece figure. Where the old scene was a soft translucent blob,
// this is a technical plate: a wireframe solid drawn in pure line, the way a
// geometry diagram is printed in the margin of an old almanac. Lines only —
// no lit surfaces — so it belongs to the same material family as every
// hairline rule in the 2D UI.

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

function Plate() {
  const groupRef = useRef(null)
  const spinRef = useRef(null)
  const accent = useLiveAccentColor()
  const reducedRef = useReducedMotionRef()
  const pointerRef = usePointerRef()

  // EdgesGeometry keeps only the polyhedron's real edges — rendering the
  // geometry with wireframe:true would also draw every triangulation seam,
  // which reads as noise rather than as a drafted figure.
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 1)), [])
  const innerEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62, 0)),
    []
  )

  useEffect(() => () => {
    edges.dispose()
    innerEdges.dispose()
  }, [edges, innerEdges])

  useFrame((_state, delta) => {
    if (spinRef.current && !reducedRef.current) {
      spinRef.current.rotation.y += delta * 0.16
      spinRef.current.rotation.x += delta * 0.05
    }
    // Pointer tilt lives on a separate group from the continuous spin so the
    // two motions don't fight over the same rotation values.
    if (groupRef.current) {
      const targetTiltX = pointerRef.current.y * 0.24
      const targetTiltZ = -pointerRef.current.x * 0.24
      groupRef.current.rotation.x += (targetTiltX - groupRef.current.rotation.x) * 0.035
      groupRef.current.rotation.z += (targetTiltZ - groupRef.current.rotation.z) * 0.035
    }
  })

  const color = accent.trim()

  return (
    <group ref={groupRef}>
      <group ref={spinRef}>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={color} transparent opacity={0.55} />
        </lineSegments>
        <lineSegments geometry={innerEdges} rotation={[0.4, 0.8, 0]}>
          <lineBasicMaterial color={color} transparent opacity={0.28} />
        </lineSegments>
      </group>
    </group>
  )
}

export default function AmbientScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 4.4], fov: 38 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Plate />
    </Canvas>
  )
}
