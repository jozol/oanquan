# Context 08: Spatial Math & Board Layout

This document provides the mathematical foundation, coordinate systems, and geometric layout algorithms implemented in [src/layout.ts](file:///Users/phucdo/Documents/projects/oanquan/src/layout.ts), [src/store.ts](file:///Users/phucdo/Documents/projects/oanquan/src/store.ts), and [src/components/Stone.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/Stone.tsx).

---

## 1. World Coordinate System

The 3D scene adheres to standard right-handed Three.js world coordinates:

```
               +Y (Up / Elevation)
                │
                │
                │        -Z (North / Player 2 Side)
                │       /
                │      /
                │     /
                │    /
  ──────────────┼───/──────────────► +X (East / Right Mandarin)
 -X (West /    /│
 Left Mandarin) /  │
              /   │
             /    │
            /     │
          +Z (South / Player 1 Side / Default Camera)
```

| Axis | Orientation | Significance in Game Board |
|------|-------------|----------------------------|
| **+X** | East / Right | Toward Right Mandarin (Cell 5, `x = +5.0`) |
| **−X** | West / Left | Toward Left Mandarin (Cell 11, `x = −5.0`) |
| **+Y** | Up | Elevation above stone altar (`y = 0` is altar surface) |
| **−Y** | Down | Subterranean fissure depth |
| **+Z** | South / Front | Player 1's side (Citizen cells `0..4`, `z = +1.0`) |
| **−Z** | North / Back | Player 2's side (Citizen cells `6..10`, `z = −1.0`) |

---

## 2. Cell Geometric Calculations

The board is dimensioned around the fundamental unit `SQUARE_SIZE = 2.0`:

```typescript
const SQUARE_SIZE = 2.0;
```

### 1. Citizen Cells (`0..4` and `6..10`):
- Dimensions: Width = `2.0`, Depth = `2.0`, Height = `0.5`.
- **Player 1 Row** (`z = +1.0`):
  - Cell `0`: `x = -4.0`
  - Cell `1`: `x = -2.0`
  - Cell `2`: `x =  0.0`
  - Cell `3`: `x = +2.0`
  - Cell `4`: `x = +4.0`
- **Player 2 Row** (`z = -1.0`):
  - Cell `6`: `x = +4.0`
  - Cell `7`: `x = +2.0`
  - Cell `8`: `x =  0.0`
  - Cell `9`: `x = -2.0`
  - Cell `10`: `x = -4.0`

### 2. Mandarin Pits (`5` and `11`):
- Semicircular cells extending from the board ends:
  - Cell `5` (Right): `x = +5.0`, `z = 0.0`, Width = `4.0`, Depth = `4.0`
  - Cell `11` (Left): `x = -5.0`, `z = 0.0`, Width = `4.0`, Depth = `4.0`

### 3. Mandarin Visual Center Offset:
Because Mandarin pits are semicircles rather than centered squares, placing stones at `c.x` would place them on the straight inner divider. The physical center of the half-disc sits offset by 1.0 unit outward:
```typescript
const centerOf = (c: CellData): [number, number] => [
  c.type === 'mandarin' ? (c.x > 0 ? c.x + 1.0 : c.x - 1.0) : c.x,
  c.z
];
```

### 4. Demon Core Medallion Position:
The glowing runic Billboard medallion displaying the Mandarin soul value sits concentric with the Demon Core at `local X = x > 0 ? 0.85 : -0.85` (world `X = ±6.0`) elevated to `local Y = 2.4` (world `Y = 2.65`), floating cleanly above the rotating gyroscopic rings.

---

## 3. Altar Plinths & Architecture Dimensions

From [src/components/Board.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/Board.tsx#L77-L99):
1. **Outer Stepped Plinth (Base)**: `args={[19.6, 0.5, 10.2]}`, position `[0, -1.0, 0]`.
2. **Intermediate Stepped Plinth**: `args={[18.4, 0.5, 9.0]}`, position `[0, -0.55, 0]`.
3. **Core Altar Foundation**: `args={[14.5, 0.8, 6.5]}`, position `[0, -0.4, 0]`.
4. **Worn Stone Altar Pad**: Plane geometry `args={[14, 6]}`, position `[0, 0.005, 0]`.

---

## 4. Key World Markers (`layout.ts`)

### Tribute Pedestals (`CAPTURE_POS`):
Where reaped souls gather beside the playing field:
```typescript
export const CAPTURE_POS = {
  1: [-8.0, 0,  2.9],  // Player 1 pedestal (South-West)
  2: [ 8.0, 0, -2.9],  // Player 2 pedestal (North-East)
} as const;
```

### Corner Braziers (`TORCH_POS`):
Stands guarding the four corners of the stepped plinth:
```typescript
export const TORCH_POS: [number, number, number][] = [
  [-8.85, -0.3,  4.15], // South-West Torch
  [ 8.85, -0.3,  4.15], // South-East Torch
  [-8.85, -0.3, -4.15], // North-West Torch
  [ 8.85, -0.3, -4.15], // North-East Torch
];
```

---

## 5. Fermat Spiral Tribute Piling Algorithm

In [src/components/Stone.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/Stone.tsx#L74-L79), captured souls are not simply stacked in a vertical pole; they are arranged in a **Fermat Golden Spiral** across multiple concentric layers:

```typescript
const n = pileIndex.current.n; // Stone index within this capture pile
const [px, , pz] = CAPTURE_POS[logicalCell === 'captured1' ? 1 : 2];

// Golden ratio divergence angle in radians: 2 * PI * (1 - 1/phi) ≈ 2.399963
const a = n * 2.399963;

// Fermat spiral radial expansion: r ∝ sqrt(n + 1)
const r = 0.13 * Math.sqrt(n + 1) * (stone.value === 1 ? 1 : 0.8);

// 14 stones per vertical stratum
const layer = Math.floor(n / 14);

v.set(
  px + Math.cos(a) * Math.min(r, 0.85),
  0.5 + layer * 0.22 + (stone.value === 1 ? 0 : 0.2),
  pz + Math.sin(a) * Math.min(r, 0.85)
);
```

### Mathematical Properties:
- **Optimal Packing**: The golden angle `2.399963 rad` (~137.5°) guarantees that stones never align into radial spokes, creating an organic pile.
- **Radial Clamping**: `Math.min(r, 0.85)` ensures souls remain contained within the `1.0`-radius circular tribute pedestal.
- **Vertical Tiering**: Every 14 stones, a new layer is stacked `+0.22` units above, forming a pyramidal mound of souls as the game progresses.
