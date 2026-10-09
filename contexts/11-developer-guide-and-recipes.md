# Context 11: Developer Guide, Testing & Recipes

This document provides developer instructions, debugging workflows, and step-by-step recipes for extending the **Ô Ăn Quan** codebase.

---

## 1. Development Workflows & Commands

### Prerequisites:
- Node.js 18+ (tested with Node 20 / 22)
- npm or pnpm

### Shell Commands:
```bash
# Start local Vite development server with HMR at http://localhost:3000
npm run dev

# Run TypeScript type check and compile production bundle into dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 2. Automated Inspection & URL Query Flags

When developing, debugging, or running automated visual verification tests, query parameters can bypass title screens and camera animations:

| URL Query Parameter | Example | Effect |
|---------------------|---------|--------|
| `instant=1` | `http://localhost:3000/?instant=1` | Bypasses title doors & camera swoop; camera starts directly above the board |
| `autostart=1` | `http://localhost:3000/?autostart=1` | Simulates user click on "Enter Sanctuary" 300ms after boot |
| `tactical=1` | `http://localhost:3000/?autostart=1&tactical=1` | Switches camera to top-down tactical view after entrance |
| `select=N` | `http://localhost:3000/?autostart=1&select=2` | Automatically selects cell `N` after entrance |

Combinable example for instant cell selection test:
```
http://localhost:3000/?instant=1&select=2
```

---

## 3. Recipe 1: Implementing an Autonomous AI Opponent (Bot)

To enable Player vs. AI mode when `currentPlayer === 2`:

### Step 1: Legal Move Evaluator
Create a utility function to enumerate all valid legal moves for Player 2:
```typescript
interface MoveOption {
  startIndex: number;
  dir: 'cw' | 'ccw';
}

function getLegalMoves(cells: CellData[], player: number): MoveOption[] {
  const minIdx = player === 1 ? 0 : 6;
  const maxIdx = player === 1 ? 4 : 10;
  const legal: MoveOption[] = [];

  for (let i = minIdx; i <= maxIdx; i++) {
    if (cells[i].stones > 0) {
      legal.push({ startIndex: i, dir: 'cw' });
      legal.push({ startIndex: i, dir: 'ccw' });
    }
  }
  return legal;
}
```

### Step 2: Move Selection Heuristic (Greedy / Minimax)
Simulate the outcome of each move against a clone of `cells` to score potential captures:
```typescript
function chooseBestMove(cells: CellData[], stones: StoneData[]): MoveOption | null {
  const moves = getLegalMoves(cells, 2);
  if (moves.length === 0) return null;

  // Simple heuristic: pick move that yields highest immediate reap, or random fallback
  let bestMove = moves[0];
  let maxGain = -1;

  for (const move of moves) {
    const projectedGain = simulateMoveGain(cells, move.startIndex, move.dir);
    if (projectedGain > maxGain) {
      maxGain = projectedGain;
      bestMove = move;
    }
  }
  return bestMove;
}
```

### Step 3: Turn Hook Integration
In [src/App.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/App.tsx), add an effect that triggers the AI move with a realistic human delay:
```typescript
useEffect(() => {
  if (started && currentPlayer === 2 && !isAnimating && !winner) {
    const timer = setTimeout(() => {
      const best = chooseBestMove(cells, stones);
      if (best) {
        executeMove(best.startIndex, best.dir);
      }
    }, 800); // 800ms thinking delay
    return () => clearTimeout(timer);
  }
}, [currentPlayer, isAnimating, winner, started]);
```

---

## 4. Recipe 2: Adding Custom Stone & Altar Themes (Skins)

The zero-asset architecture makes theme generation straightforward:

### 1. New Procedural Stone Material:
In [src/textures.ts](file:///Users/phucdo/Documents/projects/oanquan/src/textures.ts), create an alternative palette generator (e.g. Imperial Jade):
```typescript
export function makeJadeSet(seed = 42, size = 512): StoneSet {
  // Replace slate tint with imperial emerald green:
  // c.fillStyle = '#1c4a2c';
  // Add golden flecks instead of soot
}
```

### 2. New Stone Geometry / Colors:
In [src/components/Stone.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/Stone.tsx), switch stone materials conditionally:
```typescript
const jadeColor = new Color('#2ecc71');
const goldGlow = new Color('#f1c40f');
```

---

## 5. Recipe 3: Unit Testing Core Engine Logic Headlessly

Because [src/store.ts](file:///Users/phucdo/Documents/projects/oanquan/src/store.ts) is decoupled from React DOM and Three.js canvas (it only imports `fx`), you can unit test the game engine headlessly using `vitest`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './src/store';

describe('Ô Ăn Quan Engine', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('initializes with 52 total stones and 70 total points', () => {
    const { cells, stones } = useGameStore.getState();
    expect(cells.length).toBe(12);
    expect(stones.length).toBe(52);
    
    // Check initial Mandarin stones
    expect(cells[5].stones).toBe(1);
    expect(cells[11].stones).toBe(1);
  });

  it('triggers Rải Quân penalty if a player side is depleted', async () => {
    // Manually empty player 2's cells
    useGameStore.setState(s => ({
      cells: s.cells.map(c => c.owner === 2 ? { ...c, stones: 0 } : c)
    }));
    
    // Switch to player 2
    // Verify p2Score decreases by 5 and cells receive 1 stone each
  });
});
```

---

## 6. Performance & Profiling Guidelines

To maintain 60+ FPS on all devices:
1. **Never allocate Three.js objects inside `useFrame`**: Always allocate temporary `Vector3`, `Color`, or `Matrix4` objects outside the render callback.
2. **Never call `useGameStore()` without a selector**: Calling `const store = useGameStore()` re-renders the component on *any* state change. Always use `useGameStore(s => s.specificField)`.
3. **Keep `MAX_PARTICLES` within budget**: The default of `4000` requires only `~144 KB` of GPU attribute memory and 1 draw call. If raising above 10,000, consider migrating to GPU compute shaders.
4. **Tone Mapping Consistency**: All custom shaders with emissive output must leave `toneMapped={false}` if they want to punch through the Bloom filter threshold (`0.9`).
