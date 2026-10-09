// Procedural textures: worn ancient stone (colour + normal map), glowing runes,
// soft glow sprites and drifting mist. Everything is generated at load - no assets.
import * as THREE from 'three';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Sobel-style height -> tangent-space normal map (tileable). */
function heightToNormal(src: HTMLCanvasElement, strength: number) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  const H = (x: number, y: number) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export interface StoneSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

/** Weathered dungeon stone: chiselled blocks, cracks, moss and grime. */
export function makeStoneSet(seed = 7, size = 512): StoneSet {
  const rnd = mulberry32(seed);
  const height = canvas(size);
  const g = height.getContext('2d')!;

  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);

  // soft rocky undulations
  for (let i = 0; i < 260; i++) {
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, rnd() * 55 + 10, 0, Math.PI * 2);
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    g.fill();
  }

  // pitted impacts
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rnd() * 6 + 1.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // jagged cracks (with a lit lip)
  const cracks: [number, number][][] = [];
  for (let i = 0; i < 34; i++) {
    let cx = rnd() * size;
    let cy = rnd() * size;
    const pts: [number, number][] = [[cx, cy]];
    const segs = 4 + Math.floor(rnd() * 6);
    for (let j = 0; j < segs; j++) {
      cx += (rnd() - 0.5) * 70;
      cy += (rnd() - 0.5) * 70;
      pts.push([cx, cy]);
    }
    cracks.push(pts);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => g.lineTo(p[0], p[1]));
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = rnd() * 3 + 1;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.translate(1, 1);
    g.stroke();
    g.translate(-1, -1);
  }

  // fine grain
  for (let i = 0; i < 30000; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.18})`;
    g.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
  }

  // ---- colour: height + cold tint + moss + grime
  const color = canvas(size);
  const c = color.getContext('2d')!;
  c.drawImage(height, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = '#b4b4c4';
  c.fillRect(0, 0, size, size);
  c.globalCompositeOperation = 'source-over';

  // moss clings around cracks
  cracks.forEach(pts => {
    if (rnd() > 0.45) return;
    pts.forEach(([x, y]) => {
      const r = rnd() * 28 + 10;
      const gr = c.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(46,78,34,0.42)');
      gr.addColorStop(1, 'rgba(46,78,34,0)');
      c.fillStyle = gr;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    });
  });

  // soot / blood stains
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = rnd() * 50 + 20;
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() > 0.7 ? 'rgba(90,10,10,0.28)' : 'rgba(10,8,6,0.3)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const map = new THREE.CanvasTexture(color);
  const normalMap = new THREE.CanvasTexture(heightToNormal(height, 3.2));
  [map, normalMap].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  });
  return { map, normalMap };
}

/** Angular elder-futhark style glyph strip (white on transparent) for emissive runes. */
export function makeRuneTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(99);
  const w = 1024;
  const h = 128;
  const cv = canvas(w, h);
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = 16;
  const cell = w / n;
  for (let i = 0; i < n; i++) {
    const cx = i * cell + cell / 2;
    const top = 24;
    const bot = h - 24;
    const strokes: [number, number, number, number][] = [[cx, top, cx, bot]];
    const branches = 1 + Math.floor(rnd() * 3);
    for (let b = 0; b < branches; b++) {
      const y0 = top + rnd() * (bot - top) * 0.7;
      const dir = rnd() > 0.5 ? 1 : -1;
      const len = 14 + rnd() * 20;
      strokes.push([cx, y0, cx + dir * len, y0 + (rnd() > 0.5 ? -1 : 1) * (len * 0.8)]);
      if (rnd() > 0.6) strokes.push([cx, y0 + 18, cx + dir * len * 0.7, y0 + 18 + len * 0.6]);
    }
    g.shadowColor = '#ffffff';
    g.shadowBlur = 10;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.beginPath();
    strokes.forEach(s => {
      g.moveTo(s[0], s[1]);
      g.lineTo(s[2], s[3]);
    });
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Circular summoning sigil (ring + runic ticks + star) for the tribute pedestals. */
export function makeSigilTexture(): THREE.CanvasTexture {
  const s = 512;
  const cv = canvas(s);
  const g = cv.getContext('2d')!;
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  g.lineCap = 'round';
  [236, 214, 150].forEach((r, i) => {
    g.lineWidth = i === 0 ? 5 : 3;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  });
  g.lineWidth = 4;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = 160;
    const r1 = i % 2 ? 200 : 208;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a + 0.05) * r1, Math.sin(a + 0.05) * r1);
    g.stroke();
  }
  // pentagram
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
    const x = Math.cos(a) * 146;
    const y = Math.sin(a) * 146;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Selection ring for playable cells: soft rounded-rect frame glow. */
export function makeGlowRingTexture(): THREE.CanvasTexture {
  const s = 256;
  const cv = canvas(s);
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(s / 2, s / 2, s * 0.28, s / 2, s / 2, s * 0.5);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.75, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cloudy mist disc with a clear hole in the middle so the board stays crisp. */
export function makeMistTexture(seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed);
  const s = 512;
  const cv = canvas(s);
  const g = cv.getContext('2d')!;
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 0.18 + rnd() * 0.32;
    const x = s / 2 + Math.cos(a) * d * s;
    const y = s / 2 + Math.sin(a) * d * s;
    const r = 30 + rnd() * 80;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.1 + rnd() * 0.18})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // clear centre + soft outer edge
  g.globalCompositeOperation = 'destination-out';
  const hole = g.createRadialGradient(s / 2, s / 2, s * 0.14, s / 2, s / 2, s * 0.32);
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole;
  g.fillRect(0, 0, s, s);
  const edge = g.createRadialGradient(s / 2, s / 2, s * 0.38, s / 2, s / 2, s * 0.5);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
