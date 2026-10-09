import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { Cell } from './Cell';
import { Stone } from './Stone';
import { plinthSet, runeTexture, sigilTexture } from '../assets';
import { CAPTURE_POS } from '../layout';
import { fx } from '../fx';

const P1_COLOR = new THREE.Color('#ff3a1e');
const P2_COLOR = new THREE.Color('#3f9bff');

function useTiled(rx: number, ry: number) {
  const textures = useMemo(() => {
    const map = plinthSet.map.clone();
    const normalMap = plinthSet.normalMap.clone();
    [map, normalMap].forEach(t => {
      t.repeat.set(rx, ry);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    });
    return { map, normalMap };
  }, [rx, ry]);

  useEffect(() => {
    return () => {
      textures.map.dispose();
      textures.normalMap.dispose();
    };
  }, [textures]);

  return textures;
}

export function Board() {
  const cells = useGameStore(s => s.cells);
  const stones = useGameStore(s => s.stones);

  const plinth = useTiled(4, 1);
  const slab = useTiled(5, 2);
  const pad = useTiled(4, 2);

  const runeTex = useMemo(() => {
    const t = runeTexture.clone();
    t.repeat.set(7, 1);
    t.wrapS = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }, []);

  useEffect(() => {
    return () => {
      runeTex.dispose();
    };
  }, [runeTex]);

  const front = useRef<THREE.MeshBasicMaterial>(null);
  const back = useRef<THREE.MeshBasicMaterial>(null);
  const sig1 = useRef<THREE.MeshBasicMaterial>(null);
  const sig2 = useRef<THREE.MeshBasicMaterial>(null);
  const sigGroup1 = useRef<THREE.Mesh>(null);
  const sigGroup2 = useRef<THREE.Mesh>(null);

  // Runes of the active player's side flare up and breathe; the other side sleeps.
  useFrame((state, delta) => {
    const { currentPlayer, winner } = useGameStore.getState();
    const t = state.clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    const setMat = (m: THREE.MeshBasicMaterial | null, base: THREE.Color, active: boolean) => {
      if (!m) return;
      const k = active ? 1.4 + pulse * 1.6 : 0.16;
      m.color.copy(base).multiplyScalar(winner ? 1.6 : k);
    };
    setMat(front.current, P1_COLOR, currentPlayer === 1);
    setMat(back.current, P2_COLOR, currentPlayer === 2);
    setMat(sig1.current, P1_COLOR, currentPlayer === 1);
    setMat(sig2.current, P2_COLOR, currentPlayer === 2);
    runeTex.offset.x = (runeTex.offset.x + delta * 0.01) % 1;
    if (sigGroup1.current) sigGroup1.current.rotation.z += delta * 0.25;
    if (sigGroup2.current) sigGroup2.current.rotation.z -= delta * 0.25;
  });

  const stoneMat = (m: { map: THREE.Texture; normalMap: THREE.Texture }, color: string) => (
    <meshStandardMaterial map={m.map} normalMap={m.normalMap} normalScale={new THREE.Vector2(1.2, 1.2)} color={color} roughness={0.95} metalness={0.08} />
  );

  const handleDeselect = () => {
    if (useGameStore.getState().cellToSow !== null) {
      useGameStore.getState().selectCell(null);
    }
  };

  return (
    <group>
      {/* Outer stepped plinth */}
      <mesh position={[0, -1.0, 0]} receiveShadow castShadow onPointerDown={handleDeselect}>
        <boxGeometry args={[19.6, 0.5, 10.2]} />
        {stoneMat(slab, '#55555f')}
        <Edges threshold={20} color="#050508" />
      </mesh>
      <mesh position={[0, -0.55, 0]} receiveShadow castShadow onPointerDown={handleDeselect}>
        <boxGeometry args={[18.4, 0.5, 9.0]} />
        {stoneMat(slab, '#6a6a76')}
        <Edges threshold={20} color="#050508" />
      </mesh>

      {/* Ancient gothic altar core */}
      <mesh position={[0, -0.4, 0]} receiveShadow onPointerDown={handleDeselect}>
        <boxGeometry args={[14.5, 0.8, 6.5]} />
        {stoneMat(plinth, '#4a4a56')}
        <Edges threshold={20} color="#050508" />
      </mesh>

      {/* Worn inner stone pad */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onPointerDown={handleDeselect}>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial map={pad.map} normalMap={pad.normalMap} color="#2c2c36" roughness={1} />
      </mesh>

      {/* Carved rune borders: P1 front, P2 back */}
      <mesh position={[0, -0.295, 3.7]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <planeGeometry args={[13.6, 0.7]} />
        <meshBasicMaterial ref={front} map={runeTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.295, -3.7]} rotation={[-Math.PI / 2, 0, Math.PI]} renderOrder={5}>
        <planeGeometry args={[13.6, 0.7]} />
        <meshBasicMaterial ref={back} map={runeTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      {/* Tribute pedestals where reaped souls gather */}
      {([1, 2] as const).map(p => {
        const [px, , pz] = CAPTURE_POS[p];
        return (
          <group key={p} position={[px, 0, pz]}>
            <mesh position={[0, -0.15, 0]} receiveShadow castShadow>
              <cylinderGeometry args={[1.05, 1.2, 0.3, 24]} />
              {stoneMat(slab, '#4b4b57')}
              <Edges threshold={20} color="#050508" />
            </mesh>
            <mesh ref={p === 1 ? sigGroup1 : sigGroup2} position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
              <circleGeometry args={[1.0, 48]} />
              <meshBasicMaterial
                ref={p === 1 ? sig1 : sig2}
                map={sigilTexture}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}

      {/* Infernal Crevice Fire: procedural fire, licking flame tongues & embers between cells */}
      <CellCreviceFire />

      {/* Cells */}
      {cells.map(c => (
        <Cell key={c.index} cell={c} />
      ))}

      {/* Stones */}
      {stones.map(s => (
        <Stone key={s.id} stone={s} />
      ))}
    </group>
  );
}

const magmaFissureVert = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const magmaFissureFrag = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uTilingX;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.05;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vec2(vUv.x * uTilingX, vUv.y);
    float t = uTime * 0.85;

    // Soft lateral feathering so magma stays nestled naturally inside the crack
    float edgeMask = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);

    // Flowing molten veins inside subterranean chasm
    vec2 flow = vec2(t * 0.6, sin(t * 0.4) * 0.3);
    float n1 = fbm(uv * 1.8 + flow);
    float n2 = fbm(uv * 3.5 - flow * 0.5 + vec2(n1 * 1.2, n1 * 0.8));
    float n3 = fbm(uv * 7.0 + vec2(n2 * 1.5, t * 1.2));

    // Hot magma cracks between cooling basalt crust
    float magma = pow(n2 * 0.65 + n3 * 0.35, 1.8) * 1.6;
    magma *= (0.85 + 0.15 * sin(uTime * 4.0 + uv.x * 2.0));

    // Volcanic palette: dark basalt crust -> deep smoldering crimson -> glowing lava -> golden heat veins
    vec3 cBasalt = vec3(0.08, 0.015, 0.005);
    vec3 cCrimson = vec3(0.85, 0.10, 0.01);
    vec3 cLava = vec3(1.6, 0.45, 0.04);
    vec3 cGoldVein = vec3(2.2, 1.3, 0.25);

    vec3 col = mix(cBasalt, cCrimson, smoothstep(0.15, 0.45, magma));
    col = mix(col, cLava, smoothstep(0.45, 0.75, magma));
    col = mix(col, cGoldVein, smoothstep(0.75, 0.98, magma));

    float alpha = clamp(edgeMask * (0.4 + magma * 0.6), 0.0, 0.95);
    gl_FragColor = vec4(col * alpha * 1.25, alpha);
  }
`;

/**
 * Continuous 3D volumetric fire ribbons along every seam.
 * Each trench has crossed ribbons (tilted ±24° around the trench axis) with
 * domain-warped FBM procedural fire that flows continuously without laser-line artifacts.
 */
const seamRibbonVert = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const seamRibbonFrag = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uLength;
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
    // u runs in world space along the trench
    float u = vUv.x * uLength + uSeed * 13.7;
    float v = vUv.y; // 0 = base in trench, 1 = flame tip
    float t = uTime * 1.85;

    // Convective upward heat flow with domain warping
    vec2 flow = vec2(u * 1.6, v * 1.6 - t * 2.2);
    vec2 warp = vec2(
      fbm(flow + vec2(0.0, -t * 0.9)),
      fbm(flow + vec2(4.5, 1.8))
    ) * 0.45;

    float n1 = fbm(flow + warp * 1.8);
    float n2 = noise(vec2(u * 3.6 + warp.x * 2.0, v * 3.8 - t * 3.2));

    // Height dynamics: flame tongues reach up with dancing heights
    float tipHeight = 0.78 + 0.18 * noise(vec2(u * 0.9, t * 0.8));
    float vn = clamp(v / tipHeight, 0.0, 1.0);

    // Continuous roaring base: at v near 0, the fire is 100% continuous along the entire seam!
    float baseDensity = 1.0 - smoothstep(0.0, 0.35, v);

    // Tongue shaping: as v rises, the flame carves into licking fire tongues
    float tongueShape = (1.0 - vn) * (0.65 + n1 * 0.85 + n2 * 0.3) - vn * 0.35;
    float flame = max(baseDensity * 0.85, smoothstep(0.12, 0.75, tongueShape));

    // Soft root fade into the magma bed, soft tip fade
    flame *= smoothstep(0.0, 0.06, v) * smoothstep(1.0, 0.72, vn);

    // Fade at the extreme ends of the seam so it blends softly
    float endFade = smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x);
    flame *= endFade;

    if (flame < 0.01) discard;

    // AAA cinematic flame palette (rich blackbody radiation):
    vec3 cEmber = vec3(0.65, 0.05, 0.01);
    vec3 cOrange = vec3(1.05, 0.36, 0.03);
    vec3 cGold = vec3(1.20, 0.82, 0.16);
    vec3 cCore = vec3(1.35, 1.08, 0.50);

    vec3 col = mix(cEmber, cOrange, smoothstep(0.05, 0.38, flame));
    col = mix(col, cGold, smoothstep(0.38, 0.74, flame));
    col = mix(col, cCore, smoothstep(0.74, 1.0, flame) * (1.0 - vn * 0.65));

    gl_FragColor = vec4(col * flame * 1.15, flame * 0.85);
  }
`;

function createMagmaMat(tilingX: number) {
  return new THREE.ShaderMaterial({
    vertexShader: magmaFissureVert,
    fragmentShader: magmaFissureFrag,
    uniforms: {
      uTime: { value: 0 },
      uTilingX: { value: tilingX },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createSeamFireMat(length: number, seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: seamRibbonVert,
    fragmentShader: seamRibbonFrag,
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: length },
      uSeed: { value: seed },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/** Infernal subterranean magma fissures with continuous 3D volumetric fire curtains rising between cell spaces */
function CellCreviceFire() {
  const magmaMats = useMemo(() => ({
    centerMagma: createMagmaMat(10.0),
    crossMagma: createMagmaMat(4.5),
  }), []);

  // Continuous 3D crossed volumetric fire ribbons nestled inside the trenches
  // Height 0.38 places flame tips dancing naturally along the top rim of the cell stones
  const centerGeo = useMemo(() => new THREE.PlaneGeometry(10.2, 0.38, 48, 4).translate(0, 0.19, 0), []);
  const crossGeo = useMemo(() => new THREE.PlaneGeometry(4.08, 0.38, 24, 4).translate(0, 0.19, 0), []);

  const centerMatA = useMemo(() => createSeamFireMat(10.2, 1.1), []);
  const centerMatB = useMemo(() => createSeamFireMat(10.2, 3.7), []);

  const crossMatA = useMemo(() => createSeamFireMat(4.08, 5.3), []);
  const crossMatB = useMemo(() => createSeamFireMat(4.08, 7.9), []);

  const emberTimer = useRef(0);
  const light1 = useRef<THREE.PointLight>(null);
  const light2 = useRef<THREE.PointLight>(null);
  const light3 = useRef<THREE.PointLight>(null);
  const light4 = useRef<THREE.PointLight>(null);
  const light5 = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    magmaMats.centerMagma.uniforms.uTime.value = t;
    magmaMats.crossMagma.uniforms.uTime.value = t;

    centerMatA.uniforms.uTime.value = t;
    centerMatB.uniforms.uTime.value = t;
    crossMatA.uniforms.uTime.value = t;
    crossMatB.uniforms.uTime.value = t;

    // Organic erratic flicker on crevice point lights
    if (light1.current) light1.current.intensity = 3.4 + 0.8 * Math.sin(t * 13.7) + 0.3 * Math.cos(t * 22.3);
    if (light2.current) light2.current.intensity = 2.8 + 0.6 * Math.sin(t * 15.2 + 1.1) + 0.3 * Math.cos(t * 19.8);
    if (light3.current) light3.current.intensity = 2.8 + 0.6 * Math.sin(t * 16.4 + 2.3) + 0.3 * Math.cos(t * 24.1);
    if (light4.current) light4.current.intensity = 2.4 + 0.5 * Math.sin(t * 12.1 + 0.7) + 0.3 * Math.cos(t * 18.5);
    if (light5.current) light5.current.intensity = 2.4 + 0.5 * Math.sin(t * 14.8 + 3.1) + 0.3 * Math.cos(t * 21.0);

    // Continuous rising sparks/embers from the crevices
    emberTimer.current += delta;
    if (emberTimer.current > 0.04) {
      emberTimer.current = 0;
      const r = Math.random();
      if (r < 0.45) {
        fx.creviceEmbers((Math.random() - 0.5) * 9.2, 0.15, (Math.random() - 0.5) * 0.12);
      } else if (r < 0.80) {
        const colX = [-3, -1, 1, 3][Math.floor(Math.random() * 4)];
        fx.creviceEmbers(colX + (Math.random() - 0.5) * 0.1, 0.15, (Math.random() - 0.5) * 3.4);
      } else {
        const mandX = Math.random() < 0.5 ? -5.0 : 5.0;
        fx.creviceEmbers(mandX + (Math.random() - 0.5) * 0.12, 0.15, (Math.random() - 0.5) * 3.4);
      }
    }
  });

  const seamWidth = 0.22;
  const crossXs = [-5.0, -3.0, -1.0, 1.0, 3.0, 5.0];

  return (
    <group position={[0, 0, 0]}>
      {/* Dynamic warm flickering point lights inside the trenches illuminating stone walls */}
      <pointLight ref={light1} position={[0, 0.20, 0]} distance={7.5} intensity={3.4} color="#ff500a" decay={1.6} />
      <pointLight ref={light2} position={[-2.5, 0.20, 0]} distance={6.0} intensity={2.8} color="#ff6010" decay={1.6} />
      <pointLight ref={light3} position={[2.5, 0.20, 0]} distance={6.0} intensity={2.8} color="#ff6010" decay={1.6} />
      <pointLight ref={light4} position={[-5.0, 0.20, 0]} distance={5.5} intensity={2.4} color="#ff4505" decay={1.6} />
      <pointLight ref={light5} position={[5.0, 0.20, 0]} distance={5.5} intensity={2.4} color="#ff4505" decay={1.6} />

      {/* --- SUBTERRANEAN MAGMA FISSURE TRENCH BEDS (Recessed at y = 0.04 inside the cracks) --- */}
      {/* Central horizontal fissure between citizen rows */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={magmaMats.centerMagma}>
        <planeGeometry args={[10.2, seamWidth]} />
      </mesh>

      {/* Cross fissures between citizen columns + Mandarin boundaries */}
      {crossXs.map(x => (
        <mesh key={x} position={[x, 0.04, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} material={magmaMats.crossMagma}>
          <planeGeometry args={[4.08, seamWidth]} />
        </mesh>
      ))}

      {/* --- CONTINUOUS 3D VOLUMETRIC FIRE RIBBONS (Crossed inside trench for true 3D volume) --- */}
      {/* Central Trench Crossed Fire Ribbons */}
      <mesh position={[0, 0.05, 0]} rotation={[0.14, 0, 0]} geometry={centerGeo} material={centerMatA} renderOrder={4} />
      <mesh position={[0, 0.05, 0]} rotation={[-0.14, 0, 0]} geometry={centerGeo} material={centerMatB} renderOrder={4} />

      {/* Cross Trenches Crossed Fire Ribbons */}
      {crossXs.map(x => (
        <group key={x} position={[x, 0.05, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0.14]} geometry={crossGeo} material={crossMatA} renderOrder={4} />
          <mesh rotation={[0, Math.PI / 2, -0.14]} geometry={crossGeo} material={crossMatB} renderOrder={4} />
        </group>
      ))}
    </group>
  );
}
