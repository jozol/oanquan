import { useRef, type ComponentRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from './store';
import { useFx } from './fx';
import { Board } from './components/Board';
import { ParticleLayer } from './components/ParticleLayer';
import { PostFx, FxRig, ShakeGroup } from './components/Effects';
import { Torches, Mist, AmbientEmitters, Shockwaves, Floaters } from './components/Atmosphere';
import { BASE_FOV } from './layout';

function CameraRig() {
  const currentPlayer = useGameStore(s => s.currentPlayer);
  const gameMode = useGameStore(s => s.gameMode);
  const myPlayerNumber = useGameStore(s => s.myPlayerNumber);
  const started = useFx(s => s.started);
  const doorsOpening = useFx(s => s.doorsOpening);
  const tacticalView = useFx(s => s.tacticalView);
  const dragStartX = useGameStore(s => s.dragStartX);
  
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const spherical = useRef(new THREE.Spherical(21, Math.PI / 3, 0));
  const isUserOrbiting = useRef(false);

  const isInstant = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('instant') === '1';

  // Entrance flight animation state
  const entranceProgress = useRef(0);
  const isEntering = useRef(false);
  const hasEntered = useRef(isInstant);

  // Turn transition state for quick cinematic spin between players
  const prevPlayer = useRef(currentPlayer);
  const turnTransition = useRef<{
    active: boolean;
    startTheta: number;
    totalDiff: number;
    radius: number;
    phi: number;
    progress: number;
    duration: number;
  }>({
    active: false,
    startTheta: NaN,
    totalDiff: 0,
    radius: 21,
    phi: Math.PI / 3,
    progress: 0,
    duration: 0.65,
  });

  // Tactical view transition state
  const prevTactical = useRef(tacticalView);
  const viewTransition = useRef(false);

  // Initial title entrance camera coords
  const titlePos = useRef(new THREE.Vector3(0, 4.2, 23.5));
  const titleTarget = useRef(new THREE.Vector3(0, 1.2, 0));
  const playPos = useRef(new THREE.Vector3(0, 10.5, 14.8));
  const playTarget = useRef(new THREE.Vector3(0, 0, 0));

  // In online mode, Player 2 views from the opposite side
  if (gameMode === 'online' && myPlayerNumber === 2) {
    playPos.current.set(0, 10.5, -14.8);
  } else {
    playPos.current.set(0, 10.5, 14.8);
  }

  // Trigger entrance swoop when doors start opening
  if (doorsOpening && !hasEntered.current && !isEntering.current) {
    isEntering.current = true;
    entranceProgress.current = 0;
  }

  // Turn changes trigger a quick cinematic spin towards the active player's side in LOCAL mode only
  if (started && !isEntering.current && prevPlayer.current !== currentPlayer) {
    prevPlayer.current = currentPlayer;
    // In online mode, keep perspective locked to the player's side; do not spin 180 degrees every turn
    if (gameMode !== 'online') {
      turnTransition.current = {
        active: true,
        startTheta: NaN,
        totalDiff: 0,
        radius: 21,
        phi: Math.PI / 3,
        progress: 0,
        duration: 0.65, // ~650ms snappy, responsive spin
      };
    }
  }

  // Tactical view changes
  if (started && !isEntering.current && prevTactical.current !== tacticalView) {
    prevTactical.current = tacticalView;
    viewTransition.current = true;
  }

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = state.camera;

    // 1. Title screen idle (before opening doors)
    if (!started && !doorsOpening && !hasEntered.current) {
      const t = state.clock.elapsedTime;
      const hoverY = 4.2 + Math.sin(t * 0.8) * 0.12;
      const hoverX = Math.cos(t * 0.5) * 0.18;
      cam.position.set(hoverX, hoverY, 23.5);
      controls.target.copy(titleTarget.current);
      cam.lookAt(controls.target);
      return;
    }

    // 2. Entrance cinematic swoop through the opening sanctuary doors
    if (isEntering.current) {
      entranceProgress.current += delta / 2.1; // 2.1s swoop duration
      const p = Math.min(1, entranceProgress.current);
      // Ease in-out cubic
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      // Arc path: camera glides through the threshold then rises above the altar
      cam.position.lerpVectors(titlePos.current, playPos.current, ease);
      // Slight vertical arc peak
      cam.position.y += Math.sin(p * Math.PI) * 1.2;

      controls.target.lerpVectors(titleTarget.current, playTarget.current, ease);
      cam.lookAt(controls.target);
      controls.update();

      if (p >= 1) {
        isEntering.current = false;
        hasEntered.current = true;
      }
      return;
    }

    // 3. Gameplay view: OrbitControls has full freedom, NO continuous snapping!
    const isUserDragging = isUserOrbiting.current || dragStartX !== null;

    // If user interacts, instantly cancel any automated transitions
    if (isUserDragging) {
      turnTransition.current.active = false;
      viewTransition.current = false;
      return;
    }

    // 3a. Quick turn transition spin to active player's side
    if (turnTransition.current.active) {
      const tState = turnTransition.current;

      // On first frame of transition, measure current camera spherical coords
      if (isNaN(tState.startTheta)) {
        const offset = cam.position.clone().sub(controls.target);
        spherical.current.setFromVector3(offset);
        tState.startTheta = spherical.current.theta;
        tState.radius = spherical.current.radius || 21;
        tState.phi = spherical.current.phi || Math.PI / 3;

        // Player 1: 0 (front side), Player 2: Math.PI (opposite side)
        const targetTheta = currentPlayer === 1 ? 0 : Math.PI;
        let diff = targetTheta - tState.startTheta;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        tState.totalDiff = diff;
      }

      tState.progress += delta / tState.duration;
      const p = Math.min(1, tState.progress);
      // Ease in-out cubic for a fast, punchy whip
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      spherical.current.set(tState.radius, tState.phi, tState.startTheta + tState.totalDiff * ease);
      cam.position.setFromSpherical(spherical.current).add(controls.target);
      cam.lookAt(controls.target);
      controls.update();

      if (p >= 1) {
        tState.active = false;
      }
    }

    // 3b. Handle tactical view transition
    if (viewTransition.current) {
      spherical.current.setFromVector3(cam.position.clone().sub(controls.target));
      const targetPhi = tacticalView ? 0.12 : Math.PI / 3;
      const phiDiff = targetPhi - spherical.current.phi;

      if (Math.abs(phiDiff) < 0.015) {
        spherical.current.phi = targetPhi;
        viewTransition.current = false;
      } else {
        spherical.current.phi = THREE.MathUtils.damp(spherical.current.phi, targetPhi, 4.5, delta);
      }

      cam.position.setFromSpherical(spherical.current).add(controls.target);
      controls.update();
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef} 
      makeDefault 
      minDistance={6} 
      maxDistance={28}
      maxPolarAngle={Math.PI / 2 - 0.06} // Keep camera above stone plinth
      enableDamping
      dampingFactor={0.08}
      enabled={started && !isEntering.current && dragStartX === null}
      onStart={() => {
        isUserOrbiting.current = true;
        turnTransition.current.active = false;
        viewTransition.current = false;
      }}
      onEnd={() => {
        isUserOrbiting.current = false;
      }}
    />
  );
}

export function Game() {
  const isInstant = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('instant') === '1';
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: isInstant ? [0, 10.5, 14.8] : [0, 4.2, 23.5], fov: BASE_FOV }}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance' }}
      onPointerMissed={() => {
        if (useGameStore.getState().cellToSow !== null) {
          useGameStore.getState().selectCell(null);
        }
      }}
    >
      <color attach="background" args={['#07070d']} />
      <fog attach="fog" args={['#07070d', 14, 48]} />
      
      {/* Cold moonlight + warm torchlight (the torches carry their own flickering lights) */}
      <ambientLight intensity={0.9} color="#8f9bd0" />
      <hemisphereLight args={['#6a76b0', '#2a1812', 0.55]} />
      <directionalLight
        position={[-7, 15, 9]}
        castShadow
        intensity={2.2}
        color="#b4c2ff"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />

      <ShakeGroup>
        <Board />
        <Torches />
        <Mist />
        <Shockwaves />
        <Floaters />
        <ParticleLayer />
      </ShakeGroup>

      <AmbientEmitters />
      <FxRig />
      <CameraRig />
      <PostFx />
    </Canvas>
  );
}
