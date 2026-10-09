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
  syncScoresAndCounts: (p1Score: number, p2Score: number, cellCounts: number[]) => void;
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

  syncScoresAndCounts: (p1Score, p2Score, cellCounts) => {
    set(s => {
      const updatedCells = s.cells.map((c, idx) => {
        if (cellCounts[idx] !== undefined && cellCounts[idx] !== c.stones) {
          return { ...c, stones: cellCounts[idx] };
        }
        return c;
      });
      return { p1Score, p2Score, cells: updatedCells };
    });
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
      const cells = [...state.cells];
      const stonesInHand = cells[currentIndex].stones;
      cells[currentIndex] = { ...cells[currentIndex], stones: 0 };
      
      const holdingStonesIds = state.stones.filter(s => s.logicalCell === currentIndex).map(s => s.id);
      
      // Lift stones
      set(s => ({
        cells,
        stones: s.stones.map(st => holdingStonesIds.includes(st.id) ? { ...st, logicalCell: 'hand' } : st)
      }));
      {
        const [px, pz] = centerOf(cells[currentIndex]);
        fx.pickup(px, pz);
      }

      await delay(250);

      let currentStones = get().stones;
      let currentCells = get().cells;

      for (let i = 0; i < stonesInHand; i++) {
        currentIndex = getNextIndex(currentIndex, isCW);
        
        currentCells = [...currentCells];
        currentCells[currentIndex] = { ...currentCells[currentIndex], stones: currentCells[currentIndex].stones + 1 };
        
        const stoneToDropId = holdingStonesIds[i];
        currentStones = currentStones.map(st => st.id === stoneToDropId ? { ...st, logicalCell: currentIndex } : st);
        
        set({ cells: currentCells, stones: currentStones });
        {
          const dropCell = currentCells[currentIndex];
          const [dx, dz] = centerOf(dropCell);
          fx.drop(dx, dz, dropCell.type === 'mandarin');
        }
        await delay(200);
      }

      await delay(300);

      const endCell = currentCells[currentIndex];
      
      if (endCell.type === 'citizen' && endCell.stones > 1) {
        await sow();
      } else if (endCell.type === 'mandarin' || endCell.stones === 1) {
        const nextIndex = getNextIndex(currentIndex, isCW);
        if (currentCells[nextIndex].stones === 0) {
          await captureSequence(nextIndex, isCW);
        } else {
          await endTurn();
        }
      }
    };

    const captureSequence = async (emptyIndex: number, cw: boolean) => {
      let nextEmpty = emptyIndex;
      let keepCapturing = true;

      while (keepCapturing) {
        const targetIndex = getNextIndex(nextEmpty, cw);
        let currentCells = get().cells;
        
        if (currentCells[targetIndex].stones > 0) {
          currentCells = [...currentCells];
          currentCells[targetIndex] = { ...currentCells[targetIndex], stones: 0 };
          
          let currentStones = get().stones;
          const capturedIds = currentStones.filter(s => s.logicalCell === targetIndex).map(s => s.id);
          
          let valueGained = 0;
          currentStones = currentStones.map(st => {
            if (capturedIds.includes(st.id)) {
              valueGained += st.value;
              return { ...st, logicalCell: get().currentPlayer === 1 ? 'captured1' : 'captured2' };
            }
            return st;
          });

          set(s => ({
            cells: currentCells,
            stones: currentStones,
            p1Score: s.currentPlayer === 1 ? s.p1Score + valueGained : s.p1Score,
            p2Score: s.currentPlayer === 2 ? s.p2Score + valueGained : s.p2Score,
          }));

          {
            const [cx, cz] = centerOf(currentCells[targetIndex]);
            const reaper = get().currentPlayer === 1 ? 1 : 2;
            const hadMandarin = currentCells[targetIndex].type === 'mandarin';
            fx.capture(cx, cz, valueGained, reaper, hadMandarin);
            combo++;
            if (hadMandarin) fx.mandarinSlain(valueGained);
            else fx.combo(combo);
          }

          await delay(400);

          const nextNextIndex = getNextIndex(targetIndex, cw);
          if (get().cells[nextNextIndex].stones === 0) {
            nextEmpty = nextNextIndex;
          } else {
            keepCapturing = false;
            await endTurn();
          }
        } else {
          keepCapturing = false;
          await endTurn();
        }
      }
    };

    const endTurn = async () => {
      // Check win
      const finalCells = get().cells;
      if (finalCells[5].stones === 0 && finalCells[11].stones === 0) {
        let p1Extra = 0, p2Extra = 0;
        finalCells.forEach(c => {
          if (c.owner === 1) p1Extra += c.stones;
          if (c.owner === 2) p2Extra += c.stones;
        });
        const p1Final = get().p1Score + p1Extra;
        const p2Final = get().p2Score + p2Extra;
        let winner = 'Draw!';
        if (p1Final > p2Final) winner = 'Player 1 Wins!';
        if (p2Final > p1Final) winner = 'Player 2 Wins!';
        set({ p1Score: p1Final, p2Score: p2Final, isAnimating: false, winner });
        fx.win(winner === 'Draw!' ? 'draw' : 'win');
      } else {
        const nextPlayer = get().currentPlayer === 1 ? 2 : 1;
        set({ currentPlayer: nextPlayer });
        fx.turn();
        
        // --- "Rải Quân" Rule (Borrowing stones if empty) ---
        const pCells = get().cells.filter(c => c.owner === nextPlayer);
        const totalStones = pCells.reduce((sum, c) => sum + c.stones, 0);
        
        if (totalStones === 0) {
          set({ isAnimating: true });
          await delay(500); // Pause so player sees the empty board before spawning
          
          let currentCells = [...get().cells];
          let currentStones = [...get().stones];
          
          // Deduct 5 points
          fx.borrow(nextPlayer);
          if (nextPlayer === 1) {
            set(s => ({ p1Score: s.p1Score - 5 }));
          } else {
            set(s => ({ p2Score: s.p2Score - 5 }));
          }
          
          // Spawn 1 stone in each of their 5 cells with deterministic jitter so both peers match
          const startIdx = nextPlayer === 1 ? 0 : 6;
          for (let i = 0; i < 5; i++) {
             const cellIdx = startIdx + i;
             currentCells[cellIdx] = { ...currentCells[cellIdx], stones: 1 };
             const seed = (cellIdx * 19 + i * 37) % 97;
             const jX = (((seed % 10) / 10) - 0.5) * 1.2;
             const jZ = ((((Math.floor(seed / 10)) % 10) / 10) - 0.5) * 1.2;
             currentStones.push({
               id: `borrowed_${nextPlayer}_${cellIdx}_${i}`,
               logicalCell: cellIdx,
               value: 1,
               jitterX: jX,
               jitterZ: jZ
             });
          }
          
          set({ cells: currentCells, stones: currentStones });
          await delay(500);
        }
        
        set({ isAnimating: false });
      }

      // If in online mode and we just made our move, transmit state check to verify parity
      const state = get();
      if (state.gameMode === 'online' && !isRemote) {
        network.send({
          type: 'SYNC_CHECK',
          p1Score: state.p1Score,
          p2Score: state.p2Score,
          cellCounts: state.cells.map(c => c.stones),
        });
      }
    };

    await sow();
  }
}));
