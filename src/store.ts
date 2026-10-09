import { create } from 'zustand';
import { fx } from './fx';
import { network } from './network';

export type CellType = 'citizen' | 'mandarin';

export interface CellData {
  index: number;
  type: CellType;
  owner: number;
  stones: number;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface StoneData {
  id: string;
  logicalCell: number | 'hand' | 'captured1' | 'captured2';
  value: number;
  jitterX: number;
  jitterZ: number;
}

export type GameMode = 'local' | 'online';
export type PeerStatus = 'disconnected' | 'connecting' | 'waiting' | 'connected' | 'error';
export type RematchState = 'idle' | 'requested_by_me' | 'requested_by_opponent';

interface GameState {
  cells: CellData[];
  stones: StoneData[];
  currentPlayer: number;
  p1Score: number;
  p2Score: number;
  isAnimating: boolean;
  winner: string | null;
  cellToSow: number | null;
  dragStartX: number | null;
  dragStartIndex: number | null;
  dragDeltaX: number;

  // Multiplayer fields
  gameMode: GameMode;
  myPlayerNumber: 1 | 2 | null;
  roomId: string | null;
  peerStatus: PeerStatus;
  peerError: string | null;
  rematchState: RematchState;

  selectCell: (index: number | null) => void;
  startDrag: (index: number, x: number) => void;
  updateDrag: (x: number) => void;
  endDrag: (x: number) => void;
  executeMove: (startIndex: number, dir: 'cw' | 'ccw', isRemote?: boolean) => Promise<void>;
  resetGame: () => void;

  // Multiplayer actions
  setGameMode: (mode: GameMode, myPlayerNumber?: 1 | 2 | null, roomId?: string | null) => void;
  setPeerStatus: (status: PeerStatus, error?: string | null) => void;
  setRematchState: (state: RematchState) => void;
  syncRemoteBoard: (cells: CellData[], stones: StoneData[], currentPlayer: number) => void;
  syncScoresAndCounts: (p1Score: number, p2Score: number, cells: CellData[], stones: StoneData[]) => void;
  resetGameOnline: (cells?: CellData[], stones?: StoneData[]) => void;
  leaveOnline: () => void;
}

const SQUARE_SIZE = 2;

export function initGame() {
  const cells: CellData[] = [];
  const stones: StoneData[] = [];
  let stoneId = 0;

  // 0-4: P1 (Bottom row, Left to Right)
  for (let i = 0; i < 5; i++) {
    cells.push({ index: i, type: 'citizen', owner: 1, stones: 5, x: (i - 2) * SQUARE_SIZE, z: SQUARE_SIZE / 2, width: SQUARE_SIZE, depth: SQUARE_SIZE });
    for (let j = 0; j < 5; j++) stones.push({ id: `s_${stoneId++}`, logicalCell: i, value: 1, jitterX: (Math.random() - 0.5) * 1.2, jitterZ: (Math.random() - 0.5) * 1.2 });
  }

  // 5: Right Mandarin
  cells.push({ index: 5, type: 'mandarin', owner: 0, stones: 1, x: 2.5 * SQUARE_SIZE, z: 0, width: SQUARE_SIZE * 2, depth: SQUARE_SIZE * 2 });
  stones.push({ id: `m_${stoneId++}`, logicalCell: 5, value: 10, jitterX: 0, jitterZ: 0 }); // Big stone

  // 6-10: P2 (Top row, Right to Left)
  for (let i = 0; i < 5; i++) {
    cells.push({ index: 6 + i, type: 'citizen', owner: 2, stones: 5, x: (2 - i) * SQUARE_SIZE, z: -SQUARE_SIZE / 2, width: SQUARE_SIZE, depth: SQUARE_SIZE });
    for (let j = 0; j < 5; j++) stones.push({ id: `s_${stoneId++}`, logicalCell: 6 + i, value: 1, jitterX: (Math.random() - 0.5) * 1.2, jitterZ: (Math.random() - 0.5) * 1.2 });
  }

  // 11: Left Mandarin
  cells.push({ index: 11, type: 'mandarin', owner: 0, stones: 1, x: -2.5 * SQUARE_SIZE, z: 0, width: SQUARE_SIZE * 2, depth: SQUARE_SIZE * 2 });
  stones.push({ id: `m_${stoneId++}`, logicalCell: 11, value: 10, jitterX: 0, jitterZ: 0 });

  return { cells, stones };
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/** World-space centre where a cell's stones rest (Mandarin stones sit in the middle of the half-disc). */
const centerOf = (c: CellData): [number, number] => [c.type === 'mandarin' ? (c.x > 0 ? c.x + 1.0 : c.x - 1.0) : c.x, c.z];

export const useGameStore = create<GameState>((set, get) => ({
  ...initGame(),
  currentPlayer: 1,
  p1Score: 0,
  p2Score: 0,
  isAnimating: false,
  winner: null,
  cellToSow: null,
  dragStartX: null,
  dragStartIndex: null,
  dragDeltaX: 0,

  // Multiplayer default values
  gameMode: 'local',
  myPlayerNumber: null,
  roomId: null,
  peerStatus: 'disconnected',
  peerError: null,
  rematchState: 'idle',

  setGameMode: (gameMode, myPlayerNumber = null, roomId = null) => {
    set({ gameMode, myPlayerNumber, roomId });
  },

  setPeerStatus: (peerStatus, peerError = null) => {
    set({ peerStatus, peerError });
  },

  setRematchState: (rematchState) => {
    set({ rematchState });
  },

  syncRemoteBoard: (cells, stones, currentPlayer) => {
    set({ cells, stones, currentPlayer, cellToSow: null, isAnimating: false });
  },

  syncScoresAndCounts: (p1Score, p2Score, cells, stones) => {
    set({ p1Score, p2Score, cells, stones });
  },

  resetGameOnline: (customCells, customStones) => {
    const base = customCells && customStones ? { cells: customCells, stones: customStones } : initGame();
    set({
      ...base,
      currentPlayer: 1,
      p1Score: 0,
      p2Score: 0,
      isAnimating: false,
      winner: null,
      cellToSow: null,
      dragStartX: null,
      dragStartIndex: null,
      dragDeltaX: 0,
      rematchState: 'idle',
    });
  },

  leaveOnline: () => {
    network.cleanup();
    set({
      ...initGame(),
      gameMode: 'local',
      myPlayerNumber: null,
      roomId: null,
      peerStatus: 'disconnected',
      peerError: null,
      rematchState: 'idle',
      currentPlayer: 1,
      p1Score: 0,
      p2Score: 0,
      isAnimating: false,
      winner: null,
      cellToSow: null,
      dragStartX: null,
      dragStartIndex: null,
      dragDeltaX: 0,
    });
  },

  selectCell: (index) => {
    const { gameMode, myPlayerNumber, currentPlayer, isAnimating } = get();
    if (isAnimating) return;
    if (gameMode === 'online' && myPlayerNumber !== currentPlayer) return;
    set({ cellToSow: index });
  },
  
  startDrag: (index, x) => {
    const { gameMode, myPlayerNumber, currentPlayer, isAnimating } = get();
    if (isAnimating) return;
    if (gameMode === 'online' && myPlayerNumber !== currentPlayer) return;
    set({ dragStartX: x, dragStartIndex: index, dragDeltaX: 0, cellToSow: index });
  },
  
  updateDrag: (x) => {
    const { dragStartX } = get();
    if (dragStartX !== null) {
      set({ dragDeltaX: x - dragStartX });
    }
  },

  endDrag: (x) => {
    const { dragStartX, dragStartIndex, executeMove } = get();
    if (dragStartX !== null && dragStartIndex !== null) {
      const deltaX = x - dragStartX;
      if (deltaX > 50) {
        executeMove(dragStartIndex, 'ccw');
      } else if (deltaX < -50) {
        executeMove(dragStartIndex, 'cw');
      }
    }
    set({ dragStartX: null, dragStartIndex: null, dragDeltaX: 0 });
  },

  resetGame: () => {
    const { gameMode } = get();
    if (gameMode === 'online') {
      get().resetGameOnline();
    } else {
      set({ ...initGame(), currentPlayer: 1, p1Score: 0, p2Score: 0, isAnimating: false, winner: null, cellToSow: null, dragStartX: null, dragStartIndex: null, dragDeltaX: 0 });
    }
  },

  executeMove: async (startIndex, dir, isRemote = false) => {
    const { gameMode } = get();
    
    // Broadcast move to peer if initiated locally in online mode
    if (gameMode === 'online' && !isRemote) {
      network.send({ type: 'MOVE', startIndex, dir });
    }

    set({ isAnimating: true, cellToSow: null });
    
    let currentIndex = startIndex;
    const isCW = dir === 'cw';
    let combo = 0;
    
    const getNextIndex = (idx: number, cw: boolean) => cw ? (idx - 1 + 12) % 12 : (idx + 1) % 12;

    const sow = async () => {
      const state = get();
      
      // 1. Gather all stones currently residing in currentIndex
      const pickedStones = state.stones.filter(s => s.logicalCell === currentIndex);
      if (pickedStones.length === 0) {
        await endTurn();
        return;
      }

      const stonesCount = pickedStones.length;

      // 2. Lift all picked stones into hand
      set(s => ({
        cells: s.cells.map((c, i) => i === currentIndex ? { ...c, stones: 0 } : c),
        stones: s.stones.map(st => st.logicalCell === currentIndex ? { ...st, logicalCell: 'hand' } : st)
      }));

      {
        const [px, pz] = centerOf(state.cells[currentIndex]);
        fx.pickup(px, pz);
      }

      await delay(250);

      // 3. Drop stones one by one into subsequent cells along chosen direction
      let remainingHandStones = [...pickedStones];

      for (let i = 0; i < stonesCount; i++) {
        currentIndex = getNextIndex(currentIndex, isCW);
        const stoneToDrop = remainingHandStones.shift()!;
        const dropIndex = currentIndex;

        // Place stone into dropIndex and sync cell count
        const nextStones = get().stones.map(st => st.id === stoneToDrop.id ? { ...st, logicalCell: dropIndex } : st);
        const nextCells = get().cells.map((c, idx) => {
          if (idx === dropIndex) return { ...c, stones: nextStones.filter(s => s.logicalCell === dropIndex).length };
          return c;
        });

        set({ cells: nextCells, stones: nextStones });

        {
          const dropCell = nextCells[dropIndex];
          const [dx, dz] = centerOf(dropCell);
          fx.drop(dx, dz, dropCell.type === 'mandarin');
        }
        await delay(200);
      }

      await delay(320);

      // 4. Authentic Vietnamese Ô Ăn Quan Rules:
      // The last stone was dropped into `currentIndex`.
      // Now inspect the NEXT cell along the sowing direction:
      const nextIndex = getNextIndex(currentIndex, isCW);
      const nextCell = get().cells[nextIndex];
      const stonesInNextCell = get().stones.filter(s => s.logicalCell === nextIndex);

      // Case A: Next cell is a Citizen cell and HAS STONES -> Bốc rải tiếp!
      if (nextCell.type === 'citizen' && stonesInNextCell.length > 0) {
        currentIndex = nextIndex;
        await sow();
      }
      // Case B: Next cell is EMPTY (0 stones) -> Kiểm tra ăn quân!
      else if (stonesInNextCell.length === 0) {
        await captureSequence(nextIndex, isCW);
      }
      // Case C: Next cell is Mandarin with stones -> Chững ô Quan, hết lượt!
      else {
        await endTurn();
      }
    };

    const captureSequence = async (emptyIndex: number, cw: boolean) => {
      let currentEmpty = emptyIndex;
      let keepCapturing = true;

      while (keepCapturing) {
        // Target cell to eat is right after currentEmpty
        const targetIndex = getNextIndex(currentEmpty, cw);
        const targetStones = get().stones.filter(s => s.logicalCell === targetIndex);

        if (targetStones.length > 0) {
          const targetCell = get().cells[targetIndex];
          const isMandarin = targetCell.type === 'mandarin';
          let valueGained = 0;

          const nextStones = get().stones.map(st => {
            if (st.logicalCell === targetIndex) {
              valueGained += st.value;
              return {
                ...st,
                logicalCell: get().currentPlayer === 1 ? ('captured1' as const) : ('captured2' as const)
              };
            }
            return st;
          });

          const nextCells = get().cells.map((c, i) => {
            if (i === targetIndex) return { ...c, stones: 0 };
            return c;
          });

          set(s => ({
            cells: nextCells,
            stones: nextStones,
            p1Score: s.currentPlayer === 1 ? s.p1Score + valueGained : s.p1Score,
            p2Score: s.currentPlayer === 2 ? s.p2Score + valueGained : s.p2Score,
          }));

          {
            const [cx, cz] = centerOf(targetCell);
            const reaper = get().currentPlayer === 1 ? 1 : 2;
            fx.capture(cx, cz, valueGained, reaper, isMandarin);
            combo++;
            if (isMandarin) fx.mandarinSlain(valueGained);
            else fx.combo(combo);
          }

          await delay(450);

          // Now targetIndex has been reaped and is EMPTY!
          // Check for continuous capture (Ăn liên hoàn):
          // Next cell must be EMPTY, and the cell after that must have STONES!
          const afterTargetIndex = getNextIndex(targetIndex, cw);
          const afterTargetStones = get().stones.filter(s => s.logicalCell === afterTargetIndex);

          if (afterTargetStones.length === 0) {
            const nextTargetIndex = getNextIndex(afterTargetIndex, cw);
            const nextTargetStones = get().stones.filter(s => s.logicalCell === nextTargetIndex);

            if (nextTargetStones.length > 0) {
              // Valid continuous capture!
              currentEmpty = afterTargetIndex;
            } else {
              // 2 empty cells in a row -> Stop!
              keepCapturing = false;
              await endTurn();
            }
          } else {
            // Cell after target has stones (not empty) -> Stop!
            keepCapturing = false;
            await endTurn();
          }
        } else {
          // Cell after empty cell is also empty -> Stop!
          keepCapturing = false;
          await endTurn();
        }
      }
    };

    const endTurn = async () => {
      // 1. Check if both Mandarin cells are empty (5 & 11)
      const m5Stones = get().stones.filter(s => s.logicalCell === 5);
      const m11Stones = get().stones.filter(s => s.logicalCell === 11);

      if (m5Stones.length === 0 && m11Stones.length === 0) {
        // "Hết quan toàn dân thu về" - Game Over!
        let p1Extra = 0, p2Extra = 0;
        const clearedStones = get().stones.map(st => {
          if (typeof st.logicalCell === 'number') {
            const owner = get().cells[st.logicalCell].owner;
            if (owner === 1) {
              p1Extra += st.value;
              return { ...st, logicalCell: 'captured1' as const };
            } else if (owner === 2) {
              p2Extra += st.value;
              return { ...st, logicalCell: 'captured2' as const };
            }
          }
          return st;
        });

        const clearedCells = get().cells.map(c => ({ ...c, stones: 0 }));
        const p1Final = get().p1Score + p1Extra;
        const p2Final = get().p2Score + p2Extra;
        let winner = 'Draw!';
        if (p1Final > p2Final) winner = 'Player 1 Wins!';
        if (p2Final > p1Final) winner = 'Player 2 Wins!';

        set({
          cells: clearedCells,
          stones: clearedStones,
          p1Score: p1Final,
          p2Score: p2Final,
          isAnimating: false,
          winner
        });
        fx.win(winner === 'Draw!' ? 'draw' : 'win');
      } else {
        // Switch turn
        const nextPlayer = get().currentPlayer === 1 ? 2 : 1;
        set({ currentPlayer: nextPlayer });
        fx.turn();

        // 2. Rule of "Rải Quân" (Soul Debt): If active player has 0 stones in their 5 cells
        const startIdx = nextPlayer === 1 ? 0 : 6;
        const playerStones = get().stones.filter(s => {
          return typeof s.logicalCell === 'number' && s.logicalCell >= startIdx && s.logicalCell <= startIdx + 4;
        });

        if (playerStones.length === 0) {
          set({ isAnimating: true });
          await delay(500);

          // Deduct 5 points from player
          fx.borrow(nextPlayer);
          if (nextPlayer === 1) {
            set(s => ({ p1Score: s.p1Score - 5 }));
          } else {
            set(s => ({ p2Score: s.p2Score - 5 }));
          }

          // Spawn 1 stone in each of player's 5 cells
          const currentCells = [...get().cells];
          const currentStones = [...get().stones];
          for (let i = 0; i < 5; i++) {
            const cellIdx = startIdx + i;
            currentCells[cellIdx] = { ...currentCells[cellIdx], stones: 1 };
            currentStones.push({
              id: `borrowed_${nextPlayer}_${Date.now()}_${i}`,
              logicalCell: cellIdx,
              value: 1,
              jitterX: 0,
              jitterZ: 0
            });
          }

          set({ cells: currentCells, stones: currentStones });
          await delay(500);
        }

        // Clean any stray hand stones if any exist
        set(s => ({
          isAnimating: false,
          stones: s.stones.map(st => st.logicalCell === 'hand' ? { ...st, logicalCell: 0 } : st)
        }));
      }

      // If in online mode and we just made our move, transmit full verified state
      const state = get();
      if (state.gameMode === 'online' && !isRemote) {
        network.send({
          type: 'SYNC_CHECK',
          p1Score: state.p1Score,
          p2Score: state.p2Score,
          cells: state.cells,
          stones: state.stones,
        });
      }
    };

    await sow();
  }
}));
