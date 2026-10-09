import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAX_PARTICLES, positions, colors, sizes, alphas, stepParticles } from '../particles';

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vAlpha <= 0.001) discard;
    float core = smoothstep(1.0, 0.0, d);
    float glow = pow(core, 2.2) + pow(core, 8.0) * 1.5;
    gl_FragColor = vec4(vColor * glow, glow * vAlpha);
  }
`;

/** Draws the whole CPU particle pool as a single glowing point cloud. */
export function ParticleLayer() {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const dyn = (arr: Float32Array, n: number) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(positions, 3));
    g.setAttribute('aColor', dyn(colors, 3));
    g.setAttribute('aSize', dyn(sizes, 1));
    g.setAttribute('aAlpha', dyn(alphas, 1));
    g.setDrawRange(0, MAX_PARTICLES);
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  useFrame((state, delta) => {
    stepParticles(Math.min(delta, 0.05), state.clock.elapsedTime);
    const cam = state.camera as THREE.PerspectiveCamera;
    material.uniforms.uScale.value = state.gl.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    (['position', 'aColor', 'aSize', 'aAlpha'] as const).forEach(n => {
      geometry.getAttribute(n).needsUpdate = true;
    });
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={20} />;
}
