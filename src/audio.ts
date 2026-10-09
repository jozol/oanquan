// Fully synthesized sound design (WebAudio) - no audio assets required.
// Heavy stone, crystalline bells, and a dark ambient drone.

let ctx: AudioContext | null = null;
let master: GainNode;
let dry: GainNode;
let wet: GainNode;
let noiseBuf: AudioBuffer;
let ambientOn = false;
let muted = (() => {
  try {
    return localStorage.getItem('oanquan-muted') === '1';
  } catch {
    return false;
  }
})();

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeImpulse(c: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);

    dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(master);

    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx, 2.6, 2.4);
    wet = ctx.createGain();
    wet.gain.value = 0.45;
    verb.connect(wet);
    wet.connect(master);
    // Everything routed to `dry` also feeds the reverb
    const send = ctx.createGain();
    send.gain.value = 0.5;
    dry.connect(send);
    send.connect(verb);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function env(g: GainNode, t: number, peak: number, attack: number, release: number) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = c.createGain();
  env(g, t, peak, attack, dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(dry);
  src.onended = () => {
    try {
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    } catch {
      /* ignore */
    }
  };
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + attack + 0.05);
}

function tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.004) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = c.createGain();
  env(g, t, peak, attack, dur);
  o.connect(g);
  g.connect(dry);
  o.onended = () => {
    try {
      o.disconnect();
      g.disconnect();
    } catch {
      /* ignore */
    }
  };
  o.start(t);
  o.stop(t + dur + attack + 0.05);
}

/** Struck-metal / crystal bell built from inharmonic partials. */
function bell(t: number, base: number, peak: number, decay: number) {
  const partials: [number, number][] = [
    [1, 1],
    [2.76, 0.5],
    [5.4, 0.28],
    [8.93, 0.14],
  ];
  partials.forEach(([m, a], idx) => tone(t, 'sine', base * m, base * m * 0.998, decay / (1 + idx * 0.6), peak * a, 0.002));
}

let lastArrive = 0;

export const sfx = {
  /** Must be called from a user gesture the first time. */
  unlock() {
    ensure();
  },

  get muted() {
    return muted;
  },

  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem('oanquan-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  },

  /** Stone grinding as a cell is lifted. */
  pickup() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.42, 'bandpass', 180, 520, 3.5, 0.45, 0.04);
    noise(t, 0.3, 'lowpass', 900, 200, 0.7, 0.25, 0.01);
    tone(t, 'sine', 70, 55, 0.4, 0.25, 0.03);
    tone(t + 0.02, 'triangle', 660, 990, 0.25, 0.04, 0.06);
  },

  /** Stone soul dropping into a cell. `big` = Mandarin cell. */
  drop(big: boolean) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    if (big) {
      tone(t, 'sine', 95, 38, 0.5, 0.9, 0.003);
      noise(t, 0.22, 'lowpass', 1200, 120, 0.8, 0.5);
      bell(t, 196, 0.07, 1.4);
    } else {
      tone(t, 'sine', 140, 55, 0.2, 0.55, 0.002);
      noise(t, 0.07, 'bandpass', 2200, 700, 1.2, 0.3);
      bell(t, rand(740, 900), 0.05, 0.6);
    }
  },

  /** Souls reaped. `big` for Mandarin. */
  capture(big: boolean) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    noise(t, 0.55, 'bandpass', 300, 3500, 1.5, 0.35, 0.05);
    if (big) {
      tone(t, 'sawtooth', 70, 36, 1.4, 0.35, 0.01);
      tone(t, 'sine', 55, 30, 1.8, 0.9, 0.01);
      bell(t + 0.05, 130.8, 0.2, 3);
      bell(t + 0.18, 196, 0.14, 2.6);
      bell(t + 0.3, 261.6, 0.12, 3);
    } else {
      bell(t + 0.1, 523.3, 0.16, 1.4);
      bell(t + 0.2, 784, 0.1, 1.2);
    }
  },

  /** A reaped soul reaching the tribute pedestal. */
  soulArrive() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    if (t - lastArrive < 0.045) return;
    lastArrive = t;
    tone(t, 'sine', rand(1100, 1700), 2200, 0.18, 0.045, 0.002);
  },

  /** A bass gong when the turn passes. */
  turn() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sine', 110, 104, 1.1, 0.35, 0.01);
    bell(t, 220, 0.08, 1.6);
    noise(t, 0.4, 'bandpass', 250, 120, 2, 0.12, 0.05);
  },

  combo(level: number) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const notes = [392, 494, 587, 784, 988];
    for (let i = 0; i < Math.min(level + 1, notes.length); i++) bell(t + i * 0.07, notes[i], 0.1, 1.5);
  },

  /** Rune-etched click for UI. */
  click() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'triangle', 320, 120, 0.12, 0.22, 0.002);
    noise(t, 0.05, 'highpass', 2500, 5000, 0.8, 0.12);
  },

  hover() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sine', 1400, 1800, 0.07, 0.025, 0.003);
  },

  borrow() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sawtooth', 220, 82, 0.9, 0.12, 0.05);
    bell(t, 311, 0.1, 1.8);
    bell(t + 0.14, 293.7, 0.08, 1.8);
  },

  victory() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(t, 'sine', 55, 55, 3.5, 0.5, 0.05);
    [220, 277.2, 329.6, 440, 554.4, 659.3].forEach((f, i) => bell(t + 0.15 + i * 0.16, f, 0.14, 3.2));
    noise(t, 1.6, 'bandpass', 200, 4000, 0.8, 0.2, 0.4);
  },

  draw() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [329.6, 311.1, 293.7, 261.6].forEach((f, i) => bell(t + i * 0.3, f, 0.12, 2.5));
  },

  /** Dark ambient bed: detuned drone + wind + distant clangs. */
  startAmbient() {
    const c = ensure();
    if (!c || ambientOn) return;
    ambientOn = true;

    const bus = c.createGain();
    bus.gain.value = 0;
    bus.gain.linearRampToValueAtTime(1, c.currentTime + 4);
    bus.connect(dry);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 4;
    const droneGain = c.createGain();
    droneGain.gain.value = 0.07;
    [55, 55.4, 82.4, 110.3].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = i === 3 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = i === 3 ? 0.4 : 1;
      o.connect(g);
      g.connect(lp);
      o.start();
    });
    lp.connect(droneGain);
    droneGain.connect(bus);

    // slow breathing of the filter
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // wind
    const wind = c.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 420;
    wf.Q.value = 1.2;
    const wg = c.createGain();
    wg.gain.value = 0.045;
    const wlfo = c.createOscillator();
    wlfo.frequency.value = 0.11;
    const wlg = c.createGain();
    wlg.gain.value = 0.03;
    wlfo.connect(wlg);
    wlg.connect(wg.gain);
    wlfo.start();
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(bus);
    wind.start();

    // distant clangs / drips in the dungeon
    const clang = () => {
      if (!ctx) return;
      if (!muted) {
        const t = ctx.currentTime;
        bell(t, rand(300, 620) * (Math.random() < 0.3 ? 0.5 : 1), 0.03, 3.5);
      }
      setTimeout(clang, rand(7000, 16000));
    };
    setTimeout(clang, 5000);
  },

  /** Ancient massive stone doors opening with low bass rumble, lock snap, and stone grind */
  doorOpen() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    // Deep sub bass boom
    tone(t, 'sine', 65, 32, 2.2, 0.7, 0.05);
    tone(t + 0.1, 'sawtooth', 85, 40, 2.5, 0.25, 0.1);
    // Heavy stone grinding noise
    noise(t + 0.05, 1.8, 'bandpass', 240, 180, 2.0, 0.4, 0.1);
    noise(t + 0.3, 1.5, 'lowpass', 450, 120, 1.0, 0.3, 0.15);
    // Ancient metal lock snapping / breaking bell resonance
    bell(t + 0.02, 110, 0.25, 3.0);
    bell(t + 0.1, 164.8, 0.15, 2.5);
  },
};
