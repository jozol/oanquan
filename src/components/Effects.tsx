import { useMemo, useRef, ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration, ToneMapping, N8AO } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { shake } from '../fx';
import { BASE_FOV } from '../layout';

/** Cinematic post stack: AO, bloom, filmic tone-mapping, lens fringe, vignette, grain. */
export function PostFx() {
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024) ||
      window.innerWidth <= 800 ||
      window.innerHeight <= 500
    );
  }, []);

  const offset = useMemo(() => new THREE.Vector2(0.0007, 0.0009), []);

  if (isMobile) {
    // Ultra-fast mobile post pipeline: zero AO, no heavy multi-pass noise, 0 MSAA
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.92} luminanceSmoothing={0.2} radius={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette eskil={false} offset={0.26} darkness={0.88} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={2}>
      <N8AO aoRadius={1.6} distanceFalloff={1} intensity={1.8} quality="low" halfRes color="#000000" />
      <Bloom mipmapBlur intensity={0.95} luminanceThreshold={0.9} luminanceSmoothing={0.25} radius={0.65} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <ChromaticAberration offset={offset} radialModulation modulationOffset={0.25} blendFunction={BlendFunction.NORMAL} />
      <Vignette eskil={false} offset={0.24} darkness={0.92} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.07} />
    </EffectComposer>
  );
}

/**
 * Handles camera "juice": FOV punch on captures. (Shake itself is applied to the world
 * group below so it doesn't fight OrbitControls.)
 */
export function FxRig() {
  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    shake.trauma = Math.max(0, shake.trauma - delta * 2.0);
    shake.fov = 0;
    if (Math.abs(cam.fov - BASE_FOV) > 0.001) {
      cam.fov = BASE_FOV;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/** Wraps the world: subtle micro-vibration only, strictly ZERO rotation so camera angle stays rock-solid. */
export function ShakeGroup({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(state => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const s = shake.trauma * shake.trauma;
    const amp = 0.06 * s;
    // Micro-vibration along position only
    g.position.set(
      Math.sin(t * 47.1) * amp,
      Math.sin(t * 53.7) * amp * 0.4,
      Math.cos(t * 41.3) * amp
    );
    // Explicitly 0 rotation - never tilts or twists the scene angle
    g.rotation.set(0, 0, 0);
  });
  return <group ref={ref}>{children}</group>;
}
