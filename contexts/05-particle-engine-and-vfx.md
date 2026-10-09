# Context 05: Particle Engine & Visual Effects

This document details the high-performance particle engine, soul steering physics, and visual effect systems implemented in [src/particles.ts](file:///Users/phucdo/Documents/projects/oanquan/src/particles.ts), [src/components/ParticleLayer.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/ParticleLayer.tsx), and [src/fx.ts](file:///Users/phucdo/Documents/projects/oanquan/src/fx.ts).

---

## 1. High-Performance CPU Particle Engine Architecture

Rendering thousands of independent 3D meshes causes severe draw-call overhead. Instead, this system maintains a **single pre-allocated CPU particle pool** rendered via a **single GPU draw call**:

```mermaid
flowchart TD
    subgraph CPU_Buffers["CPU Typed Memory Buffers (Float32Array)"]
        pos["positions [4000 x 3]"]
        col["colors [4000 x 3]"]
        sz["sizes [4000]"]
        alp["alphas [4000]"]
        physics["vel, gravity, drag, sway, shrink, flicker, seekTarget"]
    end

    subgraph Emitters["Emission Sources"]
        Pickup["fx.pickup (Golden column)"]
        Drop["fx.drop (Dust ring + embers)"]
        Capture["fx.capture (Soul homing flock)"]
        Ambient["Ambient torches & fissures"]
    end

    subgraph Simulation["stepParticles(dt, time) Loop"]
        Euler["Euler physics & drag damping"]
        Homing["Homing steering towards tribute pedestal"]
        Arrival["Pedestal arrival -> chime & sparkle burst"]
        Fade["Alpha fade-in/out & size shrink"]
    end

    subgraph GPU_Render["Single-Draw-Call GPU Renderer (<ParticleLayer />)"]
        Geometry["Dynamic BufferGeometry (setDrawRange: 0..4000)"]
        Shader["Custom GLSL Point Shader (Additive Blending)"]
    end

    Emitters -->|alloc() ring buffer| CPU_Buffers
    CPU_Buffers --> Simulation
    Simulation -->|Update dynamic attributes| Geometry
    Geometry --> Shader
```

---

## 2. Memory Model & Ring Buffer Pool

To avoid garbage collection spikes during high-intensity combat chains:
- **Capacity**: `MAX_PARTICLES = 4000`.
- **Pre-allocation**: All physics, lifetimes, colors, and targeting data reside in contiguous typed arrays:
  ```typescript
  export const positions = new Float32Array(MAX_PARTICLES * 3);
  export const colors    = new Float32Array(MAX_PARTICLES * 3);
  export const sizes     = new Float32Array(MAX_PARTICLES);
  export const alphas    = new Float32Array(MAX_PARTICLES);
  const vel              = new Float32Array(MAX_PARTICLES * 3);
  const age              = new Float32Array(MAX_PARTICLES);
  const life             = new Float32Array(MAX_PARTICLES);
  ```
- **O(1) Ring Allocation**:
  ```typescript
  function alloc(): number {
    const i = head;
    head = (head + 1) % MAX_PARTICLES;
    return i;
  }
  ```

---

## 3. Emission Modes & Particle Physics

Particles support multiple kinematic distribution modes via `emit()`:

| Mode | Distribution Pattern | Typical Use Case |
|------|----------------------|------------------|
| `'sphere'` | Uniform isotropic 3D spherical burst | Ambient sparks, soul burst explosions |
| `'ring'` | Radial horizontal planar disk ripple | Stone impact dust rings |
| `'column'` | Concentric upward cylinder spray | Cell lift-up geysers, brazier embers |
| `box` | Uniform 3D bounding box distribution | Ground fog motes, crevice mist |

### Simulation Math (`stepParticles`):
1. **Exponential Drag**: `vel *= exp(-drag * dt)`.
2. **Gravity Acceleration**: `vel.y -= gravity * dt`.
3. **Harmonic Sway**:
   ```typescript
   positions[k]     += Math.sin(time * 1.3 + phase[i]) * sway[i] * dt;
   positions[k + 2] += Math.cos(time * 1.1 + phase[i]) * sway[i] * dt;
   ```
4. **Lifecycle Fading**:
   ```typescript
   const fadeIn  = Math.min(1, t / 0.08); // 8% rapid rise
   const fadeOut = 1 - t * t;             // Quadratic falloff
   alphas[i] = alpha0[i] * fadeIn * fadeOut;
   sizes[i]  = size0[i] * (1 - shrink[i] * t);
   ```

---

## 4. Soul Homing & Tribute Steering (`emitSouls`)

When a cell is captured, its souls burst upward before flocking toward the capturing player's tribute pedestal (`CAPTURE_POS[player]`):

1. **Initial Ejection**: Souls burst upward with random initial velocity (`vel.y = 2.5..5.5`, speed `1.5..4.0`).
2. **Seek Delay**: Each soul hovers freely for `0.25..0.55s` before homing activates.
3. **Exponential Pursuit Steering**:
   ```typescript
   const dx = target[k] - positions[k];
   const dy = target[k + 1] - positions[k + 1];
   const dz = target[k + 2] - positions[k + 2];
   const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
   
   const want = 8 + (age[i] - seekDelay[i]) * 14; // Accelerating speed
   const blend = 1 - Math.exp(-6 * dt);
   vel[k] += ((dx / dist) * want - vel[k]) * blend;
   ```
4. **Spectral Ghost Trail**: While seeking, souls emit secondary ghost particles with probability `0.35` per frame.
5. **Pedestal Impact & Chime**:
   When `dist < 0.5`, the soul is killed and triggers `arriveHandler(player, x, y, z)`:
   - Emits 3 secondary sparkle sparks on the pedestal.
   - Triggers `sfx.soulArrive()` chime sound.

---

## 5. Single-Draw-Call GLSL Shader (`ParticleLayer.tsx`)

Rendered as `THREE.Points` with a custom `ShaderMaterial`:

### Vertex Shader:
Computes perspective-correct screen-space point radius independent of camera distance and FOV:
```glsl
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}
```
Uniform `uScale` is updated every frame:
```typescript
material.uniforms.uScale.value = 
  state.gl.domElement.height / (2 * Math.tan(degToRad(cam.fov) / 2));
```

### Fragment Shader:
Draws a smooth circular core with an extended exponential outer halo:
```glsl
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0 || vAlpha <= 0.001) discard;
  float core = smoothstep(1.0, 0.0, d);
  float glow = pow(core, 2.2) + pow(core, 8.0) * 1.5;
  gl_FragColor = vec4(vColor * glow, glow * vAlpha);
}
```

---

## 6. Ground Shockwaves & 3D Combat Text

### Ground Shockwaves (`Shockwave` in [src/components/Atmosphere.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/Atmosphere.tsx#L318-L340)):
- Expanding `ringGeometry(0.82, 1, 56)` attached to the stone floor.
- Cubic ease-out expansion: `e = 1 - Math.pow(1 - k, 3)`.
- Multiplied color intensity (> 2.6) triggers bloom halo around the impact ring.

### 3D Floating Combat Text (`Floaters` in [src/components/Atmosphere.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/components/Atmosphere.tsx#L352-L370)):
- Uses `@react-three/drei`'s `<Html position={pos} center>` with CSS pointer events disabled.
- Three visual variants:
  - `.gold`: Player 1 point additions.
  - `.frost`: Player 2 point additions.
  - `.blood`: Mandarin slaying notifications.
  - `.big`: Major combo captures.
