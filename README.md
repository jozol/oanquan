# Ô Ăn Quan — Altar of the Fallen Mandarins

> **A Dark Fantasy 3D Web Re-imagining of the Classic Vietnamese Board Game**  
> *Built with React 19, Three.js, React Three Fiber, Web Audio API, and Zustand.*

---

## 🌟 Highlights & Features

- **Classic Vietnamese Rules with Dark Fantasy Lore**: Authentic Ô Ăn Quan rules including continuous circular sowing, skip-capture (*ăn luồn*), chain combos (*ăn đôi, ăn ba, đại thu hoạch*), Mandarin slaying, and the stone debt (*rải quân*) penalty rule.
- **100% Zero-External-Asset Architecture**:
  - **Zero Image Files**: All textures (weathered stone, tangent-space normal maps, elder futhark runes, summoning sigils, and mist disks) are generated procedurally on HTML5 `<canvas>` using Mulberry32 PRNG and Sobel gradient filters.
  - **Zero Audio Files**: All acoustic feedback (stone scraping, hollow thuds, crystal bells, mandarin death booms, and ambient dungeon wind) is synthesized mathematically via the Web Audio API with algorithmic impulse convolution reverb.
  - **Zero 3D Model Files**: All meshes and geometries are constructed programmatically from Three.js primitives and custom GLSL shaders.
- **Cinematic 3D Presentation & Camera Rigs**:
  - Dual gothic stone sanctuary gates with cracking demonic rune seals on boot.
  - Cinematic camera glide into the playing arena upon entering.
  - Smooth 180° turn transitions between players without snapping or locking OrbitControls.
  - Tactical top-down toggle (`T` key) and full camera rotation freedom.
  - Alchemical fluid score orbs with dynamic liquid levels and animated SVG/CSS waves.
- **High-Performance 4,000-Particle Engine**:
  - Single-draw-call CPU particle pool managed in typed `Float32Array` buffers with dynamic GLSL point rendering.
  - Autonomous soul homing physics guiding captured souls into player tribute pedestals in organic Fermat golden spirals.
- **Post-Processing Pipeline**:
  - Screen-space ambient occlusion (N8AO), Bloom halos, ACES Filmic Tone Mapping, chromatic aberration, vignette, and film grain.
  - Quadratic camera trauma falloff and FOV punch on high-value captures.
- **Full Bilingual Localization**:
  - Hot-swappable Vietnamese (`vi`) and English (`en`) with localStorage persistence.
  - In-game leather-bound **Grimoire Tome of Rules & Lore** modal (`H` or `?`).

---

## 📚 Complete Contexts Library

A comprehensive, modular **Contexts Library** documents every architectural, mechanical, mathematical, and aesthetic layer of this project:

👉 **[Browse Master Contexts Index (`contexts/INDEX.md`)](file:///Users/phucdo/Documents/projects/oanquan/contexts/INDEX.md)**

| Module | Focus Area |
|--------|------------|
| [01. Architecture Overview](file:///Users/phucdo/Documents/projects/oanquan/contexts/01-architecture-overview.md) | High-level topology, tech stack, hybrid DOM/Canvas boundary, boot sequence |
| [02. Game Rules & Mechanics](file:///Users/phucdo/Documents/projects/oanquan/contexts/02-game-rules-and-mechanics.md) | 12-cell board graph, sowing recursion, chain reaping algorithm, debt rule, victory tallies |
| [03. 3D Scene & Rendering](file:///Users/phucdo/Documents/projects/oanquan/contexts/03-3d-scene-and-rendering.md) | Three.js scene graph, dual lighting, CameraRig transitions, post-processing stack |
| [04. Procedural Textures](file:///Users/phucdo/Documents/projects/oanquan/contexts/04-procedural-assets-and-textures.md) | Zero-asset philosophy, Mulberry32 PRNG, Sobel normal map filter, rune/sigil synthesis |
| [05. Particle Engine & VFX](file:///Users/phucdo/Documents/projects/oanquan/contexts/05-particle-engine-and-vfx.md) | 4,000 particle CPU pool, GLSL point cloud shader, soul homing steering, trauma shake |
| [06. WebAudio Synthesis](file:///Users/phucdo/Documents/projects/oanquan/contexts/06-audio-synthesis-webaudio.md) | Algorithmic impulse convolution reverb, inharmonic FM bells, noise envelopes, ambient drone |
| [07. State Management](file:///Users/phucdo/Documents/projects/oanquan/contexts/07-state-management-and-data-flow.md) | Zustand stores (`useGameStore`, `useFx`, `useI18n`), async action loops, gesture sync |
| [08. Spatial Math & Layout](file:///Users/phucdo/Documents/projects/oanquan/contexts/08-spatial-math-and-board-layout.md) | Coordinate frame, cell geometry, Fermat spiral tribute piling, world positions |
| [09. UI, HUD & Theming](file:///Users/phucdo/Documents/projects/oanquan/contexts/09-ui-hud-and-theming.md) | Dark Gothic UI design, sliding stone gates, fluid orbs, Grimoire modal, keymap |
| [10. Internationalization](file:///Users/phucdo/Documents/projects/oanquan/contexts/10-internationalization-i18n.md) | Bilingual system, cultural folk vs dark fantasy glossary, schema guide |
| [11. Developer Guide & Recipes](file:///Users/phucdo/Documents/projects/oanquan/contexts/11-developer-guide-and-recipes.md) | Build commands, URL inspection flags, AI Bot recipe, custom skins recipe, testing |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server at http://localhost:3000
npm run dev

# Build production bundle
npm run build

# Preview production build
npm run preview
```

### URL Automation / Headless Inspection Flags
- `http://localhost:3000/?instant=1` — Bypasses entrance gates directly to board
- `http://localhost:3000/?instant=1&select=2` — Instantly selects cell 2
- `http://localhost:3000/?autostart=1&tactical=1` — Enters and switches to top-down tactical view

---

## 🎮 Controls

- **Select Cell**: Click, touch, or press keys `1` through `5`
- **Sow Clockwise (Left)**: Click Left Arrow, drag left, or press `Q` / `A` / `←`
- **Sow Counter-Clockwise (Right)**: Click Right Arrow, drag right, or press `E` / `D` / `→`
- **Tactical View**: Press `T`
- **Grimoire of Rules**: Press `H` or `?`
- **Toggle Language**: Press `L`
- **Mute / Unmute**: Press `M`
- **Reset Board**: Press `R`
- **Cancel / Close**: Press `Esc`
