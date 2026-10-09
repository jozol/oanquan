import { create } from 'zustand';
import { sfx } from './audio';
import * as P from './particles';
import { CAPTURE_POS } from './layout';
import { useI18n } from './i18n';

export interface Floater {
  id: number;
  pos: [number, number, number];
  text: string;
  kind: 'gold' | 'blood' | 'frost';
  big: boolean;
}

export interface Banner {
  id: number;
  title: string;
  subtitle?: string;
  tone: 'blood' | 'gold' | 'frost';
}

export interface RingData {
  id: number;
  pos: [number, number, number];
  color: string;
  size: number;
  duration: number;
}

interface FxState {
  started: boolean;
  doorsOpening: boolean;
  muted: boolean;
  tacticalView: boolean;
  grimoireOpen: boolean;
  floaters: Floater[];
  rings: RingData[];
  banner: Banner | null;
  start: () => void;
  toggleMute: () => void;
  toggleTacticalView: () => void;
  setGrimoireOpen: (open: boolean) => void;
}

let uid = 1;

/** Mutable camera-feel values read every frame by <FxRig /> (not React state). */
export const shake = { trauma: 0, fov: 0 };

const isInstant = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('instant') === '1';

export const useFx = create<FxState>((set, get) => ({
  started: isInstant,
  doorsOpening: false,
  muted: sfx.muted,
  tacticalView: false,
  grimoireOpen: false,
  floaters: [],
  rings: [],
  banner: null,
  start: () => {
    if (get().doorsOpening || get().started) return;
    sfx.unlock();
    sfx.doorOpen();
    sfx.startAmbient();
    set({ doorsOpening: true });
    // Camera swoop starts at t = 0; HUD becomes active as doors finish parting
    setTimeout(() => {
      set({ started: true });
    }, 1100);
    setTimeout(() => {
      set({ doorsOpening: false });
    }, 2400);
  },
  toggleMute: () => {
    const m = !get().muted;
    sfx.setMuted(m);
    set({ muted: m });
  },
  toggleTacticalView: () => {
    set(s => ({ tacticalView: !s.tacticalView }));
  },
  setGrimoireOpen: (open: boolean) => {
    set({ grimoireOpen: open });
  },
}));

const addTrauma = (n: number) => {
  shake.trauma = Math.min(1, shake.trauma + n);
};

function addRing(pos: [number, number, number], color: string, size: number, duration = 0.8) {
  const id = uid++;
  useFx.setState(s => ({ rings: [...s.rings.slice(-12), { id, pos, color, size, duration }] }));
  setTimeout(() => useFx.setState(s => ({ rings: s.rings.filter(r => r.id !== id) })), duration * 1000 + 100);
}

function addFloater(pos: [number, number, number], text: string, kind: Floater['kind'], big: boolean) {
  const id = uid++;
  useFx.setState(s => ({ floaters: [...s.floaters, { id, pos, text, kind, big }] }));
  setTimeout(() => useFx.setState(s => ({ floaters: s.floaters.filter(f => f.id !== id) })), 1900);
}

let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function showBanner(title: string, subtitle: string | undefined, tone: Banner['tone'], ms = 2400) {
  const id = uid++;
  useFx.setState({ banner: { id, title, subtitle, tone } });
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => useFx.setState(s => (s.banner?.id === id ? { banner: null } : s)), ms);
}

// Colours >1 intentionally exceed the bloom threshold so they glow.
const GOLD: [number, number, number] = [3.2, 2.1, 0.5];
const EMBER: [number, number, number] = [3.0, 1.1, 0.25];
const BLOOD: [number, number, number] = [3.4, 0.35, 0.25];
const FROST: [number, number, number] = [0.8, 1.8, 3.4];
const DUST: [number, number, number] = [0.55, 0.5, 0.45];

// Soul arrival: sparkle at the pedestal + chime
P.setArriveHandler((player, x, y, z) => {
  P.emit(x, y, z, {
    count: 3,
    color: player === 1 ? [3.4, 0.8, 0.5] : [0.8, 1.6, 3.4],
    speed: [0.6, 1.8],
    size: [0.05, 0.1],
    life: [0.3, 0.6],
    gravity: 2,
    drag: 1,
  });
  sfx.soulArrive();
});

export const fx = {
  pickup(x: number, z: number) {
    sfx.pickup();
    P.emit(x, 0.7, z, { count: 16, color: GOLD, mode: 'column', speed: [1, 2.8], size: [0.05, 0.1], life: [0.5, 1], drag: 1.2, radius: 0.5, flicker: 0.5 });
    P.emit(x, 0.55, z, { count: 10, color: DUST, mode: 'ring', speed: [0.6, 1.4], size: [0.12, 0.22], life: [0.5, 0.9], drag: 2, alpha: 0.5 });
    addTrauma(0.05);
  },

  drop(x: number, z: number, big: boolean) {
    sfx.drop(big);
    P.emit(x, 0.55, z, { count: big ? 34 : 12, color: DUST, mode: 'ring', speed: big ? [1.5, 3.6] : [0.6, 1.8], size: big ? [0.2, 0.4] : [0.1, 0.22], life: [0.5, 1], drag: 2.4, alpha: 0.55, shrink: 0 });
    P.emit(x, 0.6, z, { count: big ? 22 : 7, color: EMBER, mode: 'sphere', up: 1.5, speed: [1, 3], size: [0.04, 0.09], life: [0.4, 0.9], gravity: 7, flicker: 0.6 });
    addRing([x, 0.52, z], big ? '#ff6a2a' : '#ffcc55', big ? 2.4 : 1.1, big ? 0.9 : 0.6);
    addTrauma(big ? 0.4 : 0.07);
  },

  capture(x: number, z: number, value: number, player: 1 | 2, big: boolean) {
    sfx.capture(big);
    const target = CAPTURE_POS[player];
    P.emitSouls(x, 0.9, z, Math.min(44, Math.round(value * 2.2 + 8)), target, player, player === 1 ? BLOOD : FROST);
    P.emit(x, 0.8, z, { count: big ? 60 : 24, color: big ? BLOOD : GOLD, mode: 'sphere', up: 2, speed: [2, big ? 7 : 4.5], size: [0.05, 0.13], life: [0.5, 1.2], gravity: 5, flicker: 0.5 });
    addRing([x, 0.52, z], big ? '#ff2a1a' : '#ffd36a', big ? 4.2 : 2.2, big ? 1.1 : 0.8);
    addFloater([x, 1.9, z], `+${value}`, player === 1 ? 'gold' : 'frost', big);
    addTrauma(big ? 0.35 : 0.12);
    shake.fov = 0;
  },

  combo(n: number) {
    if (n < 2) return;
    sfx.combo(n);
    const isVi = useI18n.getState().lang === 'vi';
    const title = isVi ? (n === 2 ? 'ĂN ĐÔI' : n === 3 ? 'ĂN BA' : 'ĐẠI THU HOẠCH') : (n === 2 ? 'DOUBLE REAP' : n === 3 ? 'TRIPLE REAP' : 'SOUL HARVEST');
    const sub = isVi ? `Chuỗi liên hoàn ×${n}` : `chain ×${n}`;
    showBanner(title, sub, 'gold', 1800);
  },

  mandarinSlain(value: number) {
    const isVi = useI18n.getState().lang === 'vi';
    showBanner(
      isVi ? 'ĐÃ ĐẬP TAN Ô QUAN!' : 'MANDARIN SLAIN',
      isVi ? `+${value} quân hồn vào đài tế` : `+${value} souls claimed`,
      'blood',
      2600
    );
  },

  turn() {
    sfx.turn();
  },

  borrow(player: number) {
    sfx.borrow();
    const isVi = useI18n.getState().lang === 'vi';
    showBanner(
      isVi ? 'RẢI QUÂN — NỢ HỒN' : 'SOULS BORROWED',
      isVi ? `Người Chơi ${player === 1 ? 'I' : 'II'} trích 5 quân từ đài tế  ·  −5` : `Player ${player === 1 ? 'I' : 'II'} begs the altar  ·  −5`,
      'frost',
      2600
    );
    // Steady camera during soul borrowing
  },

  win(kind: 'draw' | 'win') {
    if (kind === 'win') sfx.victory();
    else sfx.draw();
    // celebratory fireworks of embers over the altar
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        const x = (Math.random() - 0.5) * 12;
        const z = (Math.random() - 0.5) * 5;
        P.emit(x, 2 + Math.random() * 3, z, { count: 50, color: i % 2 ? GOLD : EMBER, speed: [2, 6], size: [0.06, 0.14], life: [0.9, 1.7], gravity: 3, drag: 0.8, flicker: 0.6 });
        addTrauma(0.15);
      }, i * 320);
    }
  },

  /** Wisps trailing a levitating cell while it is dragged. */
  dragWisp(x: number, y: number, z: number) {
    P.emit(x, y, z, { count: 1, color: GOLD, speed: [0.1, 0.5], size: [0.05, 0.1], life: [0.4, 0.8], gravity: -0.5, drag: 1, flicker: 0.5, radius: 0.3 });
  },

  /** Ambient: embers rising off the braziers. */
  brazierEmbers(x: number, y: number, z: number) {
    P.emit(x, y, z, { count: 1, color: EMBER, mode: 'column', speed: [0.8, 1.8], size: [0.04, 0.09], life: [1.2, 2.4], sway: 0.6, flicker: 0.6, radius: 0.2, shrink: 0.7 });
  },

  /** Ambient: embers drifting up from the flaming crevices between cells. */
  creviceEmbers(x: number, y: number, z: number) {
    P.emit(x, y, z, {
      count: 1,
      color: Math.random() < 0.35 ? [3.5, 2.2, 0.6] : [3.4, 0.85, 0.15],
      mode: 'column',
      speed: [0.4, 1.2],
      size: [0.035, 0.075],
      life: [0.7, 1.5],
      sway: 0.35,
      flicker: 0.7,
      radius: 0.08,
      shrink: 0.85,
    });
  },

  FROST,
  BLOOD,
};
