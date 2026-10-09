import { useState, Suspense, useMemo, useRef, useCallback, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Text, Billboard } from '@react-three/drei';
import { CellData, useGameStore } from '../store';
import { stoneSet } from '../assets';
import { sfx } from '../audio';
import * as THREE from 'three';
import cinzelFont from '../assets/fonts/cinzel-bold.woff';

export const Cell = memo(function Cell({ cell }: { cell: CellData }) {
  const { index, type, x, z, width, depth } = cell;
  const stonesValue = useGameStore(
    useCallback(
      s => s.stones.reduce((acc, st) => st.logicalCell === index ? acc + st.value : acc, 0),
      [index]
    )
  );
  const stonesCount = cell.stones;

  const currentPlayer = useGameStore(s => s.currentPlayer);
  const cellToSow = useGameStore(s => s.cellToSow);
  const dragStartIndex = useGameStore(s => s.dragStartIndex);
  const dragDeltaX = useGameStore(s => s.dragDeltaX);
  const isAnimating = useGameStore(s => s.isAnimating);
  const selectCell = useGameStore(s => s.selectCell);
  
  const [hovered, setHovered] = useState(false);

  const isClickable = !isAnimating && cell.owner === currentPlayer && stonesCount > 0;
  const isSelected = cellToSow === index;
  
  let isDropTarget = false;
  if (dragStartIndex !== null) {
    const isCW = dragDeltaX < -20;
    const isCCW = dragDeltaX > 20;
    if (isCW) {
      isDropTarget = index === (dragStartIndex - 1 + 12) % 12;
    } else if (isCCW) {
      isDropTarget = index === (dragStartIndex + 1) % 12;
    }
  }

  let color = '#7a7a85';
  let edgeColor = '#111111';
  let scale = 1;

  if (isSelected) {
    color = '#9a8a50'; 
    edgeColor = '#ffcc00'; 
  } else if (isDropTarget) {
    color = '#aaccff'; 
    edgeColor = '#ffffff';
    scale = 1.05;
  } else if (hovered && isClickable && dragStartIndex === null) {
    color = '#8a5a40'; 
    edgeColor = '#ff5500'; 
    scale = 1.02; 
  }

  const normalScale = useMemo(() => new THREE.Vector2(1.1, 1.1), []);
  const glowColor = isSelected ? '#ffaa00' : isDropTarget ? '#66aaff' : hovered && isClickable ? '#ff5a1a' : '#000000';
  const glowIntensity = isSelected ? 0.55 : isDropTarget ? 0.7 : hovered && isClickable ? 0.35 : 0;

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    if (isClickable && dragStartIndex === null) {
      document.body.style.cursor = 'grab';
      sfx.hover();
    }
  };
  const handlePointerOut = () => {
    setHovered(false);
    document.body.style.cursor = '';
  };
  
  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    if (isClickable) {
      useGameStore.getState().startDrag(index, e.clientX);
    } else {
      selectCell(null);
    }
  };

  const height = 0.5;

  let visualX = x;
  if (type === 'mandarin') {
    visualX = x > 0 ? x + 0.15 : x - 0.15;
  }

  const slopeWidth = width - 0.2;
  const slopeExtrudeSettings = { depth: slopeWidth, bevelEnabled: false };
  const slopeShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.25); 
    shape.lineTo(0, 0.25);  
    shape.lineTo(0.75, -0.25); 
    shape.lineTo(0, -0.25);
    return shape;
  }, []);

  const isP1 = cell.owner === 1;
  const slopeRotY = isP1 ? -Math.PI / 2 : Math.PI / 2;
  const slopePosX = isP1 ? slopeWidth / 2 : -slopeWidth / 2;
  const slopePosZ = isP1 ? 1.0 : -1.0;

  const slopeAngle = Math.atan2(0.5, 0.75); 
  const textRotX = isP1 ? -Math.PI / 2 + slopeAngle : -Math.PI / 2 - slopeAngle;
  const textRotZ = isP1 ? 0 : Math.PI;
  const textPosZ = isP1 ? 1.375 : -1.375;

  return (
    <group position={[visualX, height / 2, z]}>
      <mesh 
        scale={scale}
        castShadow
        receiveShadow
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
      >
        {type === 'citizen' ? (
          <boxGeometry args={[width - 0.1, height, depth - 0.1]} />
        ) : (
          <cylinderGeometry args={[
            width / 2 - 0.05, 
            width / 2 - 0.05, 
            height, 
            64, 
            1, 
            false, 
            x > 0 ? 0 : Math.PI, 
            Math.PI              
          ]} />
        )}
        
        <meshStandardMaterial 
          color={color} 
          map={stoneSet.map}
          normalMap={stoneSet.normalMap}
          normalScale={normalScale}
          roughness={1} 
          metalness={0.1}
          emissive={glowColor}
          emissiveIntensity={glowIntensity}
        />
        <Edges scale={1} threshold={15} color={edgeColor} />
      </mesh>

      {/* --- SOLID SLOPED WEDGES --- */}
      {type === 'citizen' && (
        <mesh position={[slopePosX, 0, slopePosZ]} rotation={[0, slopeRotY, 0]} castShadow receiveShadow>
          <extrudeGeometry args={[slopeShape, slopeExtrudeSettings]} />
          <meshStandardMaterial color={color} map={stoneSet.map} normalMap={stoneSet.normalMap} normalScale={normalScale} roughness={1} emissive={glowColor} emissiveIntensity={glowIntensity} />
          <Edges threshold={15} color={edgeColor} />
        </mesh>
      )}

      {/* --- 3D INTERACTIVE SOWING ARROWS (When Cell is Selected) --- */}
      {isSelected && !isAnimating && (
        <DirectionArrows cellIndex={index} width={width} currentPlayer={currentPlayer} />
      )}

      {/* --- 3D CARVED CITIZEN NUMBERS --- */}
      {stonesValue > 0 && type === 'citizen' && (
        <Suspense fallback={null}>
          <Text
            position={[0, 0.035, textPosZ]}
            rotation={[textRotX, 0, textRotZ]}
            fontSize={0.42}
            color={hovered ? '#ffffff' : isSelected ? '#ffea75' : '#ffcc00'}
            font={cinzelFont}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.035}
            outlineColor="#000000"
            depthOffset={-2}
            renderOrder={20}
          >
            {stonesValue.toString()}
          </Text>
        </Suspense>
      )}

      {/* --- DEMON CORE MANDARIN RUNIC MEDALLION & UNCLIPPED NUMBER (Always faces camera) --- */}
      {stonesValue > 0 && type === 'mandarin' && (
        <Billboard position={[x > 0 ? 0.85 : -0.85, 2.4, 0]}>
          {/* Dark obsidian stone seal pedestal */}
          <mesh position={[0, 0, -0.015]}>
            <circleGeometry args={[0.54, 32]} />
            <meshBasicMaterial color="#12121a" />
          </mesh>
          {/* Glowing gold runic boundary ring */}
          <mesh position={[0, 0, -0.005]}>
            <ringGeometry args={[0.42, 0.52, 32]} />
            <meshBasicMaterial color="#ffaa00" toneMapped={false} />
          </mesh>
          {/* Engraved golden numeral: depthTest false and elevated to guarantee zero clipping */}
          <Suspense fallback={null}>
            <Text
              position={[0, 0, 0.02]}
              fontSize={0.48}
              color="#ffcc00"
              font={cinzelFont}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.045}
              outlineColor="#050508"
              depthOffset={-10}
              renderOrder={50}
              material-depthTest={false}
            >
              {stonesValue.toString()}
            </Text>
          </Suspense>
        </Billboard>
      )}
    </group>
  );
});

function DirectionArrows({
  cellIndex,
  width,
  currentPlayer
}: {
  cellIndex: number;
  width: number;
  currentPlayer: number;
}) {
  const [hoverLeft, setHoverLeft] = useState(false);
  const [hoverRight, setHoverRight] = useState(false);
  const executeMove = useGameStore(s => s.executeMove);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(state => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = 0.95 + Math.sin(t * 4.5) * 0.06;
  });

  const arrowRotY = currentPlayer === 1 ? 0 : Math.PI;

  return (
    <group ref={groupRef} rotation={[0, arrowRotY, 0]}>
      {/* Left Arrow (Clockwise) */}
      <group
        position={[-width * 0.44, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLeft(true);
          document.body.style.cursor = 'pointer';
          sfx.hover();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHoverLeft(false);
          document.body.style.cursor = '';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          document.body.style.cursor = '';
          sfx.click();
          executeMove(cellIndex, 'cw');
        }}
      >
        <mesh position={[0, 0, 0]}>
          <circleGeometry args={[0.38, 24]} />
          <meshBasicMaterial
            color={hoverLeft ? '#ffdd44' : '#ff9922'}
            transparent
            opacity={hoverLeft ? 0.45 : 0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <Suspense fallback={null}>
          <Text
            position={[0, 0, 0.02]}
            fontSize={0.44}
            color={hoverLeft ? '#ffffff' : '#ffd566'}
            font={cinzelFont}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.035}
            outlineColor="#000000"
          >
            ◀
          </Text>
        </Suspense>
      </group>

      {/* Right Arrow (Counter-Clockwise) */}
      <group
        position={[width * 0.44, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverRight(true);
          document.body.style.cursor = 'pointer';
          sfx.hover();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHoverRight(false);
          document.body.style.cursor = '';
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          document.body.style.cursor = '';
          sfx.click();
          executeMove(cellIndex, 'ccw');
        }}
      >
        <mesh position={[0, 0, 0]}>
          <circleGeometry args={[0.38, 24]} />
          <meshBasicMaterial
            color={hoverRight ? '#ffdd44' : '#ff9922'}
            transparent
            opacity={hoverRight ? 0.45 : 0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <Suspense fallback={null}>
          <Text
            position={[0, 0, 0.02]}
            fontSize={0.44}
            color={hoverRight ? '#ffffff' : '#ffd566'}
            font={cinzelFont}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.035}
            outlineColor="#000000"
          >
            ▶
          </Text>
        </Suspense>
      </group>
    </group>
  );
}
