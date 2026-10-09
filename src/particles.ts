// A tiny CPU particle engine. One shared pool drawn by <ParticleLayer /> as a single
// additive-blended THREE.Points object (so thousands of sparks cost one draw call).

export const MAX_PARTICLES = 4000;

export const positions = new Float32Array(MAX_PARTICLES * 3);
export const colors = new Float32Array(MAX_PARTICLES * 3);
export const sizes = new Float32Array(MAX_PARTICLES);
export const alphas = new Float32Array(MAX_PARTICLES);

const vel = new Float32Array(MAX_PARTICLES * 3);
const age = new Float32Array(MAX_PARTICLES);
const life = new Float32Array(MAX_PARTICLES); // 0 => dead slot
const size0 = new Float32Array(MAX_PARTICLES);
const alpha0 = new Float32Array(MAX_PARTICLES);
const gravity = new Float32Array(MAX_PARTICLES);
const drag = new Float32Array(MAX_PARTICLES);
const sway = new Float32Array(MAX_PARTICLES);
const phase = new Float32Array(MAX_PARTICLES);
const shrink = new Float32Array(MAX_PARTICLES);
const flicker = new Float32Array(MAX_PARTICLES);
const seekPlayer = new Uint8Array(MAX_PARTICLES);
const seekDelay = new Float32Array(MAX_PARTICLES);
const target = new Float32Array(MAX_PARTICLES * 3);
const trail = new Uint8Array(MAX_PARTICLES);

let head = 0;
let arriveHandler: ((player: number, x: number, y: number, z: number) => void) | null = null;

export const setArriveHandler = (fn: typeof arriveHandler) => {
  arriveHandler = fn;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface BurstOptions {
  count: number;
  color: [number, number, number];
  /** Values above 1 push the particle into the bloom range. */
  speed?: [number, number];
  size?: [number, number];
  life?: [number, number];
  gravity?: number;
  drag?: number;
  /** 'sphere' = all directions, 'ring' = flat outward ripple, 'column' = upward spray. */
  mode?: 'sphere' | 'ring' | 'column';
  up?: number;
  shrink?: number;
  sway?: number;
  alpha?: number;
  flicker?: number;
  /** Random spawn offset radius around the origin. */
  radius?: number;
  /** Per-axis spawn box instead of a sphere (overrides radius). */
  box?: [number, number, number];
}

function alloc(): number {
  const i = head;
  head = (head + 1) % MAX_PARTICLES;
  return i;
}

function reset(i: number) {
  age[i] = 0;
  seekPlayer[i] = 0;
  trail[i] = 0;
  seekDelay[i] = 0;
}

export function emit(x: number, y: number, z: number, o: BurstOptions) {
  const speed = o.speed ?? [1, 3];
  const sz = o.size ?? [0.06, 0.12];
  const lf = o.life ?? [0.6, 1.2];
  const mode = o.mode ?? 'sphere';
  for (let n = 0; n < o.count; n++) {
    const i = alloc();
    reset(i);
    const k = i * 3;

    if (o.box) {
      positions[k] = x + rand(-o.box[0], o.box[0]);
      positions[k + 1] = y + rand(-o.box[1], o.box[1]);
      positions[k + 2] = z + rand(-o.box[2], o.box[2]);
    } else {
      const r = o.radius ?? 0;
      positions[k] = x + rand(-r, r);
      positions[k + 1] = y + rand(-r, r) * 0.3;
      positions[k + 2] = z + rand(-r, r);
    }

    const s = rand(speed[0], speed[1]);
    const a = Math.random() * Math.PI * 2;
    if (mode === 'ring') {
      vel[k] = Math.cos(a) * s;
      vel[k + 1] = rand(0, 0.4) + (o.up ?? 0);
      vel[k + 2] = Math.sin(a) * s;
    } else if (mode === 'column') {
      vel[k] = Math.cos(a) * s * 0.3;
      vel[k + 1] = s + (o.up ?? 0);
      vel[k + 2] = Math.sin(a) * s * 0.3;
    } else {
      const u = Math.random() * 2 - 1;
      const w = Math.sqrt(1 - u * u);
      vel[k] = Math.cos(a) * w * s;
      vel[k + 1] = u * s + (o.up ?? 0);
      vel[k + 2] = Math.sin(a) * w * s;
    }

    colors[k] = o.color[0];
    colors[k + 1] = o.color[1];
    colors[k + 2] = o.color[2];
    size0[i] = rand(sz[0], sz[1]);
    life[i] = rand(lf[0], lf[1]);
    gravity[i] = o.gravity ?? 0;
    drag[i] = o.drag ?? 0;
    sway[i] = o.sway ?? 0;
    phase[i] = Math.random() * 100;
    shrink[i] = o.shrink ?? 0.5;
    flicker[i] = o.flicker ?? 0;
    alpha0[i] = o.alpha ?? 1;
  }
}

/** Souls burst out of a cell, then get dragged into the owner's tribute pedestal. */
export function emitSouls(
  x: number,
  y: number,
  z: number,
  count: number,
  to: readonly [number, number, number],
  player: number,
  color: [number, number, number]
) {
  for (let n = 0; n < count; n++) {
    const i = alloc();
    reset(i);
    const k = i * 3;
    positions[k] = x + rand(-0.4, 0.4);
    positions[k + 1] = y + rand(0, 0.4);
    positions[k + 2] = z + rand(-0.4, 0.4);
    const a = Math.random() * Math.PI * 2;
    const s = rand(1.5, 4);
    vel[k] = Math.cos(a) * s;
    vel[k + 1] = rand(2.5, 5.5);
    vel[k + 2] = Math.sin(a) * s;
    colors[k] = color[0];
    colors[k + 1] = color[1];
    colors[k + 2] = color[2];
    size0[i] = rand(0.14, 0.26);
    life[i] = 3;
    gravity[i] = 0;
    drag[i] = 0;
    sway[i] = 0;
    phase[i] = Math.random() * 100;
    shrink[i] = 0.4;
    flicker[i] = 0.4;
    alpha0[i] = 1;
    seekPlayer[i] = player;
    seekDelay[i] = rand(0.25, 0.55);
    target[k] = to[0] + rand(-0.3, 0.3);
    target[k + 1] = to[1] + 0.6 + rand(0, 0.5);
    target[k + 2] = to[2] + rand(-0.3, 0.3);
    trail[i] = 1;
  }
}

function kill(i: number) {
  life[i] = 0;
  sizes[i] = 0;
  alphas[i] = 0;
}

export function stepParticles(dt: number, time: number) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (life[i] <= 0) continue;
    age[i] += dt;
    if (age[i] >= life[i]) {
      kill(i);
      continue;
    }
    const k = i * 3;
    const t = age[i] / life[i];

    if (seekPlayer[i] > 0 && age[i] > seekDelay[i]) {
      const dx = target[k] - positions[k];
      const dy = target[k + 1] - positions[k + 1];
      const dz = target[k + 2] - positions[k + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.5) {
        const p = seekPlayer[i];
        const px = positions[k], py = positions[k + 1], pz = positions[k + 2];
        kill(i);
        arriveHandler?.(p, px, py, pz);
        continue;
      }
      const want = 8 + (age[i] - seekDelay[i]) * 14;
      const blend = 1 - Math.exp(-6 * dt);
      vel[k] += ((dx / dist) * want - vel[k]) * blend;
      vel[k + 1] += ((dy / dist) * want - vel[k + 1]) * blend;
      vel[k + 2] += ((dz / dist) * want - vel[k + 2]) * blend;

      // Ghostly trail left behind by each soul
      if (trail[i] && Math.random() < 0.35) {
        const j = alloc();
        reset(j);
        const q = j * 3;
        positions[q] = positions[k];
        positions[q + 1] = positions[k + 1];
        positions[q + 2] = positions[k + 2];
        vel[q] = rand(-0.2, 0.2);
        vel[q + 1] = rand(-0.1, 0.3);
        vel[q + 2] = rand(-0.2, 0.2);
        colors[q] = colors[k] * 0.7;
        colors[q + 1] = colors[k + 1] * 0.7;
        colors[q + 2] = colors[k + 2] * 0.7;
        size0[j] = size0[i] * 0.55;
        life[j] = rand(0.3, 0.55);
        gravity[j] = 0;
        drag[j] = 2;
        sway[j] = 0;
        phase[j] = 0;
        shrink[j] = 1;
        flicker[j] = 0;
        alpha0[j] = 0.7;
      }
    } else {
      vel[k + 1] -= gravity[i] * dt;
      if (drag[i] > 0) {
        const d = Math.exp(-drag[i] * dt);
        vel[k] *= d;
        vel[k + 1] *= d;
        vel[k + 2] *= d;
      }
    }

    positions[k] += vel[k] * dt;
    positions[k + 1] += vel[k + 1] * dt;
    positions[k + 2] += vel[k + 2] * dt;
    if (sway[i] > 0) {
      positions[k] += Math.sin(time * 1.3 + phase[i]) * sway[i] * dt;
      positions[k + 2] += Math.cos(time * 1.1 + phase[i]) * sway[i] * dt;
    }

    const fadeIn = Math.min(1, t / 0.08);
    const fadeOut = 1 - t * t;
    let a = alpha0[i] * fadeIn * fadeOut;
    if (flicker[i] > 0) a *= 1 - flicker[i] + flicker[i] * (0.5 + 0.5 * Math.sin(time * 28 + phase[i]));
    alphas[i] = a;
    sizes[i] = size0[i] * (1 - shrink[i] * t);
  }
}
