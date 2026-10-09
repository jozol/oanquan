import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, Mesh, Vector3 } from 'three';
import { StoneData, useGameStore } from '../store';
import { fx } from '../fx';
import { CAPTURE_POS } from '../layout';

const v = new Vector3();

// Rich cinematic colors with tone-mapping preserved to prevent clipping
const coreAmber = new Color('#ffe082');
const goldEmissive = new Color('#ff7700');
const demonCrimson = new Color('#9e0c0c');
const demonGlow = new Color('#ff1e0a');

export const Stone = memo(function Stone({ stone }: { stone: StoneData }) {
  const groupRef = useRef<Group>(null);
  const outerRingRef = useRef<Mesh>(null);
  const innerRingRef = useRef<Mesh>(null);
  const coreRef = useRef<Mesh>(null);
  const pileIndex = useRef<{ cell: StoneData['logicalCell'] | null; n: number }>({ cell: null, n: 0 });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const { dragStartIndex, dragDeltaX, currentPlayer, cells, stones } = useGameStore.getState();
    const stoneData = stones.find(s => s.id === stone.id) || stone;
    const { logicalCell, jitterX, jitterZ } = stoneData;
    
    const isDragged = dragStartIndex === logicalCell && typeof logicalCell === 'number';

    const time = state.clock.elapsedTime;
    const idHash = stone.id.length * 1.618 + jitterX * 8.5; // Unique phase per stone
    
    // Normal cores hover gently, demonic cores pulse with eldritch majesty
    const amplitude = stone.value === 1 ? 0.05 : 0.12;
    const baseHover = stone.value === 1 ? 0.04 : 0.18;
    const bobOffset = Math.sin(time * 2.8 + idHash) * amplitude + baseHover;

    if (isDragged) {
      const c = cells.find(c => c.index === logicalCell);
      if (c) {
        const visualMultiplier = currentPlayer === 1 ? 0.015 : -0.015; 
        const maxDrag = 2.0;
        let dragShift = dragDeltaX * visualMultiplier;
        dragShift = Math.max(-maxDrag, Math.min(maxDrag, dragShift));

        // Levitate the stones and move them left or right
        v.set(c.x + jitterX + dragShift, 2.5 + bobOffset, c.z + jitterZ);
        if (Math.random() < delta * 9) {
          const p = groupRef.current.position;
          fx.dragWisp(p.x, p.y, p.z);
        }
      }
    } else if (typeof logicalCell === 'number') {
      const c = cells.find(c => c.index === logicalCell);
      if (c) {
        let targetX = c.x;
        if (c.type === 'mandarin') {
          targetX = c.x > 0 ? c.x + 1.0 : c.x - 1.0;
        }

        if (stone.value > 1) {
          // Demonic Mandarin core sits centrally in the Mandarin half-disc
          v.set(targetX, 0.5 + 0.65 + bobOffset, c.z);
        } else {
          // Citizen soul crystal: golden spiral spacing so every stone is distinct
          const sameCellStones = stones.filter(s => s.logicalCell === logicalCell && s.value === 1);
          const n = Math.max(0, sameCellStones.findIndex(s => s.id === stone.id));
          const totalInCell = sameCellStones.length;

          let offsetX = 0;
          let offsetZ = 0;
          let offsetY = 0;

          if (c.type === 'mandarin') {
            // In Mandarin cell, distribute citizen stones in an orbit around the big core
            const angle = n * ((Math.PI * 2) / Math.max(1, totalInCell));
            offsetX = Math.cos(angle) * 0.95;
            offsetZ = Math.sin(angle) * 0.72;
          } else {
            // Sunflower golden angle distribution for square cell basin
            if (n > 0) {
              const goldenAngle = 2.399963;
              const a = n * goldenAngle;
              const r = Math.min(0.68, 0.22 * Math.sqrt(n));
              offsetX = Math.cos(a) * r;
              offsetZ = Math.sin(a) * r;
            }
            const layer = Math.floor(n / 7);
            offsetY = layer * 0.16;
          }

          v.set(targetX + offsetX, 0.5 + 0.28 + offsetY + bobOffset, c.z + offsetZ);
        }
      }
    } else if (logicalCell === 'hand') {
      const isAnim = useGameStore.getState().isAnimating;
      const targetY = isAnim ? 3.2 + bobOffset : 0.78;
      v.set(groupRef.current.position.x, targetY, groupRef.current.position.z);
    } else if (logicalCell === 'captured1' || logicalCell === 'captured2') {
      if (pileIndex.current.cell !== logicalCell) {
        const same = stones.filter(s => s.logicalCell === logicalCell);
        pileIndex.current = { cell: logicalCell, n: Math.max(0, same.findIndex(s => s.id === stone.id)) };
      }
      const n = pileIndex.current.n;
      const [px, , pz] = CAPTURE_POS[logicalCell === 'captured1' ? 1 : 2];
      const r = 0.13 * Math.sqrt(n + 1) * (stone.value === 1 ? 1 : 0.8);
      const a = n * 2.399963;
      const layer = Math.floor(n / 14);
      v.set(px + Math.cos(a) * Math.min(r, 0.85), 0.5 + layer * 0.22 + (stone.value === 1 ? 0 : 0.2), pz + Math.sin(a) * Math.min(r, 0.85));
    }

    groupRef.current.position.lerp(v, 0.18);

    // Natural rotation and animations
    if (stone.value === 1) {
      // Individual natural orientation tilt + subtle slow yaw spin
      groupRef.current.rotation.y += delta * 0.45;
      groupRef.current.rotation.x = Math.sin(idHash) * 0.25;
      groupRef.current.rotation.z = Math.cos(idHash) * 0.25;
    } else {
      // Demonic orrery gyroscopic motion
      if (outerRingRef.current) {
        outerRingRef.current.rotation.x += delta * 1.1;
        outerRingRef.current.rotation.y += delta * 0.7;
      }
      if (innerRingRef.current) {
        innerRingRef.current.rotation.y -= delta * 0.9;
        innerRingRef.current.rotation.z += delta * 0.6;
      }
      // Living eldritch heartbeat pulse
      if (coreRef.current) {
        const pulse = 1.0 + 0.05 * Math.sin(time * 3.6);
        coreRef.current.scale.setScalar(pulse);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 5, 0]}>
      {stone.value === 1 ? (
        /* --- SMALL STONE: "Radiant Soul Shard Crystal" --- */
        <group scale={0.82}>
          {/* Inner luminous soul spark */}
          <mesh>
            <octahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color={coreAmber} emissive="#ffaa22" emissiveIntensity={1.4} roughness={0.1} />
          </mesh>
          {/* Faceted amber soul gemstone with specular glints */}
          <mesh castShadow receiveShadow>
            <dodecahedronGeometry args={[0.26, 0]} />
            <meshStandardMaterial
              color="#e89824"
              emissive={goldEmissive}
              emissiveIntensity={0.55}
              roughness={0.14}
              metalness={0.18}
              transparent
              opacity={0.92}
            />
          </mesh>
          {/* Antique runic gold binding ring */}
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.31, 0.022, 16, 32]} />
            <meshStandardMaterial color="#c49a3f" metalness={0.88} roughness={0.28} />
          </mesh>
        </group>
      ) : (
        /* --- LARGE STONE: "Caged Demonic Core Relic" --- */
        <group scale={0.92}>
          {/* Pulsating eldritch obsidian core */}
          <mesh ref={coreRef} castShadow>
            <icosahedronGeometry args={[0.54, 1]} />
            <meshStandardMaterial
              color={demonCrimson}
              emissive={demonGlow}
              emissiveIntensity={1.25}
              roughness={0.18}
              metalness={0.22}
            />
          </mesh>
          {/* Ancient dark gothic forged iron orrery cage */}
          <mesh castShadow>
            <torusKnotGeometry args={[0.42, 0.08, 96, 16, 2, 3]} />
            <meshStandardMaterial color="#2d2826" metalness={0.92} roughness={0.34} />
          </mesh>
          {/* Rotating runic brass gyroscopic rings */}
          <mesh ref={outerRingRef}>
            <torusGeometry args={[0.78, 0.024, 16, 64]} />
            <meshStandardMaterial color="#bf3c15" emissive="#ff3305" emissiveIntensity={1.0} roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh ref={innerRingRef} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.78, 0.024, 16, 64]} />
            <meshStandardMaterial color="#bf3c15" emissive="#ff3305" emissiveIntensity={1.0} roughness={0.3} metalness={0.8} />
          </mesh>
          <pointLight color="#ff2614" intensity={4.5} distance={5.5} decay={2} />
        </group>
      )}
    </group>
  );
});
