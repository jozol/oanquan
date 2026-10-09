# Context 01: Architecture & System Topology

This document details the architectural topology, tech stack, and lifecycle of the **Ô Ăn Quan: Altar of the Fallen Mandarins** web application.

---

## 1. Technical Stack & Dependencies

The project is built on modern web and WebGL technologies:

| Package | Version | Purpose |
|---------|---------|---------|
| `react` / `react-dom` | `^19.3.0` | React 19 core UI framework |
| `three` | `^0.170.0` | 3D WebGL engine & scenegraph |
| `@react-three/fiber` | `^9.8.1` | Declarative Three.js reconciler for React |
| `@react-three/drei` | `^10.7.9` | Utilities for R3F (`OrbitControls`, `Edges`, `Billboard`, `Html`, `Text`) |
| `@react-three/postprocessing` | `^3.1.3` | Postprocessing pipeline wrapper for R3F |
| `postprocessing` | `^6.39.5` | Three.js postprocessing pass engine (N8AO, ACES Filmic, Bloom, etc.) |
| `zustand` | `^5.0.15` | Fast, unopinionated, transient state management |
| `typescript` | `^5.0.0` | Strict type checking |
| `vite` | `^8.3.1` | Fast bundler and development server with Rolldown chunk splitting |

---

## 2. Source Code Directory Structure

```
src/
├── main.tsx             # React entry point, mounts <App /> to #app
├── App.tsx              # Root presentation component: HUD, Modals, Gates, Orbs
├── Game.tsx             # R3F Canvas container, CameraRig, lighting, ShakeGroup
├── store.ts             # Core game state, board model, sowing & capture algorithms
├── fx.ts                # VFX coordinator (screen shake, camera trauma, floaters, banners)
├── audio.ts             # Zero-asset procedural Web Audio API synthesis engine
├── particles.ts         # High-performance CPU particle engine (4,000 particles)
├── textures.ts          # Procedural texture generator (stone, normal maps, runes, sigils)
├── assets.ts            # Singleton cache of procedural textures
├── layout.ts            # World-space constants (capture positions, torch positions, FOV)
├── i18n.ts              # Bilingual localization (Vietnamese/English) & translations
├── index.css            # Minimal global resets and 2D stone badge animations
├── style.css            # Dark Gothic theme styling, Diablo II UI, glass liquid orbs
└── components/
    ├── Board.tsx        # 3D Altar plinth, rune borders, tribute pedestals, crevice magma
    ├── Cell.tsx         # 12 board cells (citizen boxes & mandarin semicircles), hover, grab
    ├── Stone.tsx        # Floating soul pebbles & gyroscopic eldritch mandarin cores
    ├── Atmosphere.tsx   # Procedural brazier fire shaders, coal beds, mist, shockwaves
    ├── ParticleLayer.tsx# Single-draw-call GLSL point cloud rendering the particle pool
    └── Effects.tsx      # Post-processing stack (N8AO, Bloom, ToneMapping), FxRig, ShakeGroup
```

---

## 3. Hybrid Reconciler Boundary (DOM vs Canvas)

A crucial architectural detail is the coexistence of **two React reconcilers**:
1. **React DOM Reconciler** (`react-dom/client`): Mounts `<App />`, managing HTML HUD overlays, title gates, liquid orbs, Grimoire modals, and banners.
2. **React Three Fiber Reconciler** (`@react-three/fiber`): Renders inside `<Canvas>`, managing WebGL scenegraph nodes, meshes, lights, shaders, and materials.

### The State Bridging Strategy
Passing state across the DOM/Canvas boundary via traditional React Context causes full fiber reconciliation passes and severe frame drops. Instead, the application uses **Zustand stores** (`useGameStore`, `useFx`, `useI18n`):
- **React Components** in both DOM and Canvas subscribe selectively to reactive slices:
  ```typescript
  const currentPlayer = useGameStore(s => s.currentPlayer);
  const started = useFx(s => s.started);
  ```
- **High-Frequency Frame Loops** (`useFrame` in 3D components) read state non-reactively without triggering component re-renders:
  ```typescript
  useFrame((state, delta) => {
    const { currentPlayer, winner } = useGameStore.getState();
    // mutate Three.js objects directly at 60+ FPS
  });
  ```
- **Global Mutable Singletons** (`shake` object in [src/fx.ts](file:///Users/phucdo/Documents/projects/oanquan/src/fx.ts#L48)) handle per-frame camera trauma calculations without entering React's scheduling queue.

---

## 4. Application Boot & Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Main as main.tsx
    participant Assets as assets.ts / textures.ts
    participant Audio as audio.ts
    participant Store as store.ts
    participant App as App.tsx
    participant Game as Game.tsx (R3F)

    User->>Main: Loads page
    Main->>Assets: Module load imports assets.ts
    Assets->>Assets: Procedurally generates textures (Mulberry32, Sobel normals, runes, sigils)
    Main->>App: Mounts <App />
    App->>Store: Initializes initGame() (12 cells, 52 stones)
    App->>Game: Mounts <Game /> with R3F Canvas
    Game->>Game: CameraRig positions camera in title hover mode: (hoverX, hoverY, 23.5)
    App->>User: Displays Sanctuary Stone Gates with glowing Demonic Rune Seal

    User->>App: Clicks "Bắt Đầu Nghi Lễ / Enter Sanctuary" (or URL autostart)
    App->>Audio: sfx.unlock(), sfx.doorOpen(), sfx.startAmbient()
    App->>Game: doorsOpening = true -> CameraRig begins 2.1s cubic swoop into altar
    Note over App: At t = 1.1s, started = true (HUD fades in)
    Note over App: At t = 2.4s, doorsOpening = false (doors hidden)
    Note over Game: Camera releases to OrbitControls; active player runes illuminate
```

---

## 5. URL Inspection & Automation Overrides

For automated verification, debugging, or headless testing, [src/App.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/App.tsx#L102-L121) and [src/Game.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/Game.tsx#L23) inspect query parameters:

| Parameter | Values | Behavior |
|-----------|--------|----------|
| `instant` | `1` | Bypasses title gates and camera swoop entirely; starts directly above altar |
| `autostart` | `1` | Automatically triggers the sanctuary entrance sequence after 300ms |
| `tactical` | `1` | Automatically switches camera to top-down tactical view after entrance |
| `select` | `0..4` / `6..10` | Pre-selects a specific cell index after entrance |

Example: `http://localhost:3000/?autostart=1&tactical=1&select=2`

---

## 6. Performance & Memory Guarantees

1. **Zero Asset Network Latency**: Zero HTTP image/audio downloads. Build output is a single JS bundle and CSS file, ready to boot offline.
2. **Fixed Memory Particle Footprint**: Particle pool is preallocated (`Float32Array(MAX_PARTICLES * 3)`); zero garbage collector spikes during intense combat chains.
3. **Optimized Draw Calls**: 4,000 sparks, embers, and souls render in a single `THREE.Points` draw call with custom GLSL point sizing.
4. **Tone Mapping Preservation**: Emissive colors intentionally scale up to 3.5x for post-processing Bloom thresholding, while ToneMapping (`ACES_FILMIC`) and N8AO prevent white clipping.
