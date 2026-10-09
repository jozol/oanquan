import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import { fx, useFx, RingData, Floater } from '../fx';
import { emit } from '../particles';
import { TORCH_POS } from '../layout';
import { plinthSet, mistTextures } from '../assets';

/* ------------------------------------------------------------------ */
/*  Flame: multi-layer, domain-warped procedural fire                  */
/* ------------------------------------------------------------------ */
const flameVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flameFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSeed;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.45 + uSeed * 19.3;
    float y = uv.y;

    // Upward convective heat flow with domain warping
    vec2 p = vec2((uv.x - 0.5) * 2.5, y * 1.9 - t * 2.5);
    vec2 warp = vec2(fbm(p + vec2(0.0, -t * 0.9)), fbm(p + vec2(4.2, 1.5))) * 0.5;
    float n1 = fbm(p + warp * 1.6);
    float n2 = noise(vec2(p.x * 3.2 + 2.0, y * 3.8 - t * 3.4));

    // Teardrop brazier flame envelope: broad at the bowl, tapering to dynamic dancing tips
    float tipH = 0.88 + 0.10 * sin(t * 3.2) + 0.05 * cos(t * 5.7);
    float yn = clamp(y / tipH, 0.0, 1.0);

    // Lateral sway driven by convective updraft
    float sway = (warp.x - 0.25) * 0.38 * y + sin(t * 2.5 + y * 3.5) * 0.06 * y;
    float x = abs((uv.x - 0.5) * 2.0 - sway);

    // Natural flame width: wide at base, parabolic taper
    float w = pow(1.0 - yn, 0.65) * (0.65 + 0.35 * smoothstep(0.0, 0.2, y)) * (0.8 + 0.35 * n2);
    float body = smoothstep(1.0, 0.0, x / max(w, 0.001));

    // Multi-tongue flame density
    float flame = body * smoothstep(1.0, 0.12, yn + (n1 - 0.5) * 0.32);
    flame *= smoothstep(0.0, 0.07, y); // soft base blend into the coals

    if (flame < 0.015) discard;

    // Rich cinematic blackbody fire palette (balanced to avoid clipping to white):
    vec3 cEmber = vec3(0.68, 0.06, 0.01);
    vec3 cOrange = vec3(1.05, 0.38, 0.03);
    vec3 cGold = vec3(1.15, 0.78, 0.16);
    vec3 cCore = vec3(1.30, 1.05, 0.55);

    vec3 col = mix(cEmber, cOrange, smoothstep(0.05, 0.40, flame));
    col = mix(col, cGold, smoothstep(0.40, 0.75, flame));
    col = mix(col, cCore, smoothstep(0.75, 1.0, flame) * (1.0 - yn * 0.65));

    // Modulated intensity for lush organic glow
    gl_FragColor = vec4(col * flame * 1.15, flame * 0.85);
  }
`;

const coalsFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSeed;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;

    float t = uTime * 0.8 + uSeed * 7.0;
    float n1 = noise(p * 5.0 + vec2(t * 0.3, -t * 0.2));
    float n2 = noise(p * 11.0 + vec2(-t * 0.4, t * 0.5));
    float heat = pow(n1 * 0.6 + n2 * 0.4, 1.5) * (1.0 - r * 0.5);
    heat *= 0.85 + 0.15 * sin(t * 3.5);

    vec3 cBasalt = vec3(0.12, 0.02, 0.01);
    vec3 cLava = vec3(1.2, 0.35, 0.03);
    vec3 cHot = vec3(1.5, 0.95, 0.25);

    vec3 col = mix(cBasalt, cLava, smoothstep(0.2, 0.55, heat));
    col = mix(col, cHot, smoothstep(0.55, 0.9, heat));
    float alpha = smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(col * alpha * 1.2, alpha);
  }
`;

function BrazierFire({ seed }: { seed: number }) {
  const uniforms1 = useMemo(() => ({ uTime: { value: 0 }, uSeed: { value: seed } }), [seed]);
  const uniforms2 = useMemo(() => ({ uTime: { value: 0 }, uSeed: { value: seed + 3.7 } }), [seed]);
  const uniforms3 = useMemo(() => ({ uTime: { value: 0 }, uSeed: { value: seed + 7.1 } }), [seed]);
  const coalsUniforms = useMemo(() => ({ uTime: { value: 0 }, uSeed: { value: seed } }), [seed]);

  useFrame(s => {
    const t = s.clock.elapsedTime;
    uniforms1.uTime.value = t;
    uniforms2.uTime.value = t;
    uniforms3.uTime.value = t;
    coalsUniforms.uTime.value = t;
  });

  const flameMat1 = useMemo(() => new THREE.ShaderMaterial({
    uniforms: uniforms1,
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [uniforms1]);

  const flameMat2 = useMemo(() => new THREE.ShaderMaterial({
    uniforms: uniforms2,
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [uniforms2]);

  const flameMat3 = useMemo(() => new THREE.ShaderMaterial({
    uniforms: uniforms3,
    vertexShader: flameVert,
    fragmentShader: flameFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [uniforms3]);

  const coalsMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: coalsUniforms,
    vertexShader: flameVert,
    fragmentShader: coalsFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [coalsUniforms]);

  // Scaled to fit naturally into the 0.44-radius brazier bowl
  const w = 0.76;
  const h = 1.35;

  return (
    <group position={[0, 1.44, 0]}>
      {/* Living animated incandescent coal bed nestled in the bowl */}
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} material={coalsMat}>
        <circleGeometry args={[0.38, 28]} />
      </mesh>

      {/* 3D Cross-quad volumetric fire body (gives true volume from any camera angle) */}
      <mesh position={[0, h * 0.44, 0]} material={flameMat1}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh position={[0, h * 0.44, 0]} rotation-y={Math.PI / 2} material={flameMat2}>
        <planeGeometry args={[w, h]} />
      </mesh>

      {/* Camera-facing billboard core for rich volumetric brilliance */}
      <Billboard position={[0, h * 0.42, 0]}>
        <mesh material={flameMat3}>
          <planeGeometry args={[w * 0.85, h * 0.92]} />
        </mesh>
      </Billboard>
    </group>
  );
}

function Torch({ position, seed }: { position: [number, number, number]; seed: number }) {
  const light = useRef<THREE.PointLight>(null);
  const stoneProps = { map: plinthSet.map, normalMap: plinthSet.normalMap, color: '#8a8a98', roughness: 1, metalness: 0.05 };

  useFrame((s, delta) => {
    const t = s.clock.elapsedTime + seed * 10;
    if (light.current) {
      const f = 0.85 + Math.sin(t * 11.3) * 0.08 + Math.sin(t * 23.7) * 0.05 + Math.sin(t * 5.1) * 0.06 + Math.random() * 0.03;
      light.current.intensity = 36 * f;
    }
    if (Math.random() < delta * 14) fx.brazierEmbers(position[0], position[1] + 1.55, position[2]);
  });

  return (
    <group position={position}>
      {/* base, shaft, bowl */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.46, 0.54, 0.28, 8]} />
        <meshStandardMaterial {...stoneProps} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 1.0, 8]} />
        <meshStandardMaterial {...stoneProps} />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.22, 0.28, 10]} />
        <meshStandardMaterial {...stoneProps} color="#6a6a78" />
      </mesh>
      {/* Volumetric 3D brazier fire with living coal bed */}
      <BrazierFire seed={seed} />
      <pointLight ref={light} position={[0, 1.9, 0]} color="#ff8a3a" distance={26} decay={2} intensity={36} />
    </group>
  );
}

export function Torches() {
  return (
    <>
      {TORCH_POS.map((p, i) => (
        <Torch key={i} position={p} seed={i * 1.7} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Low-lying mist swirling around the altar                           */
/* ------------------------------------------------------------------ */
const MIST = [
  { y: -0.14, size: 52, opacity: 0.55, speed: 0.012, color: '#6f7ca3' },
  { y: 0.06, size: 40, opacity: 0.4, speed: -0.018, color: '#8a6f8f' },
  { y: 0.32, size: 34, opacity: 0.28, speed: 0.025, color: '#5b6a92' },
];

export function Mist() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, d) => {
    refs.current.forEach((m, i) => {
      if (m) m.rotation.z += d * MIST[i].speed;
    });
  });
  return (
    <>
      {MIST.map((m, i) => (
        <mesh key={i} ref={el => (refs.current[i] = el)} position={[0, m.y, 0]} rotation={[-Math.PI / 2, 0, i]} renderOrder={-1}>
          <planeGeometry args={[m.size, m.size]} />
          <meshBasicMaterial map={mistTextures[i]} color={m.color} transparent opacity={m.opacity} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Ambient embers and dust motes                                      */
/* ------------------------------------------------------------------ */
export function AmbientEmitters() {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (Math.random() < dt * 14) {
      emit(0, 0.1, 0, {
        count: 1,
        color: [2.4, 0.9, 0.2],
        mode: 'column',
        speed: [0.3, 0.9],
        box: [10, 0.1, 5],
        size: [0.03, 0.07],
        life: [4, 8],
        sway: 0.5,
        flicker: 0.6,
        shrink: 0.6,
        alpha: 0.9,
      });
    }
    if (Math.random() < dt * 9) {
      emit(0, 2.5, 0, {
        count: 1,
        color: [0.55, 0.65, 1.2],
        mode: 'sphere',
        speed: [0.03, 0.18],
        box: [11, 2.5, 6],
        size: [0.025, 0.05],
        life: [5, 10],
        sway: 0.25,
        shrink: 0,
        alpha: 0.55,
      });
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/*  Shockwave rings and floating combat text                           */
/* ------------------------------------------------------------------ */
function Shockwave({ ring }: { ring: RingData }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const t0 = useRef<number | null>(null);
  const color = useMemo(() => new THREE.Color(ring.color).multiplyScalar(2.6), [ring.color]);

  useFrame(s => {
    if (!mesh.current || !mat.current) return;
    if (t0.current === null) t0.current = s.clock.elapsedTime;
    const k = Math.min((s.clock.elapsedTime - t0.current) / ring.duration, 1);
    const e = 1 - Math.pow(1 - k, 3);
    mesh.current.scale.setScalar(0.15 + e * ring.size);
    mat.current.opacity = (1 - k) * 0.95;
  });

  return (
    <mesh ref={mesh} position={ring.pos} rotation-x={-Math.PI / 2} scale={0.15} renderOrder={15}>
      <ringGeometry args={[0.82, 1, 56]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

export function Shockwaves() {
  const rings = useFx(s => s.rings);
  return (
    <>
      {rings.map(r => (
        <Shockwave key={r.id} ring={r} />
      ))}
    </>
  );
}

function FloaterView({ f }: { f: Floater }) {
  return (
    <Html position={f.pos} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`floater ${f.kind} ${f.big ? 'big' : ''}`}>{f.text}</div>
    </Html>
  );
}

export function Floaters() {
  const floaters = useFx(s => s.floaters);
  return (
    <>
      {floaters.map(f => (
        <FloaterView key={f.id} f={f} />
      ))}
    </>
  );
}
