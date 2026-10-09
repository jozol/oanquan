# Context 09: UI, HUD & Dark Gothic Theming

This document details the visual design system, CSS architecture, interactive HUD components, and gothic styling implemented in [src/App.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/App.tsx) and [src/style.css](file:///Users/phucdo/Documents/projects/oanquan/src/style.css).

---

## 1. Aesthetic Design System: Gothic Dark Fantasy

The aesthetic fuses **Diablo II** and **Elden Ring** dark gothic fantasy with traditional Vietnamese folk iconography:
- **Color Palette**:
  - Background & Void: `#07070d` (Deep midnight obsidian).
  - Altar Stone: `#2c2c36` to `#6a6a76` (Cold weathered basalt and slate).
  - Player 1 (Blood / Fire): `#ff3a1e` (Crimson ruby).
  - Player 2 (Frost / Spirit): `#3f9bff` (Azure spectral frost).
  - Highlights & Emissives: `#ffe082` (Warm amber) and `#ffaa00` (Molten gold).
- **Typography**:
  - Headings: `Cinzel`, serif (preloaded via `/fonts/cinzel-bold.woff`).
  - Runes: Elder Futhark Unicode glyphs (`ᚠ` Fehu / Soul, `ᛟ` Othala / Sanctum).
  - Body: High-legibility serif with gold text-shadows.

---

## 2. Sanctuary Portal & Cracking Stone Gates

The game boots with the screen sealed behind **massive double gothic stone gates** ([src/App.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/App.tsx#L445-L497)):

```
┌───────────────────────────────┐
│       PORTAL ARCH VIGNETTE    │
│  ┌──────────────┬───────────┐ │
│  │  LEFT GATE   │RIGHT GATE │ │
│  │  Iron Bands  │Iron Bands │ │
│  │              │           │ │
│  │       DEMONIC SEAL       │ │
│  │          [ ᛟ ]           │ │
│  │                          │ │
│  │   "BẮT ĐẦU NGHI LỄ"      │ │
│  └──────────────┴───────────┘ │
└───────────────────────────────┘
```

### Transition Mechanics:
When the user clicks **"Bắt Đầu Nghi Lễ / Enter Sanctuary"**:
1. Class `.opening` is added to `.sanctuary-portal`.
2. Audio triggers `sfx.doorOpen()` (grinding granite + groaning iron).
3. The central demonic seal fractures and bursts.
4. Left gate slides left (`transform: translateX(-105%)`), right gate slides right (`transform: translateX(105%)`) over 2.4s.
5. Camera swoop begins simultaneously, flying through the parted gates onto the altar.
6. At `t = 2.4s`, the portal element is permanently hidden (`display: none`).

---

## 3. Liquid Score Orbs (`Orb` Component)

Scores are presented not as flat text, but as **alchemical glass orbs filled with sloshing fluid**:

```
      ┌───────────┐
     /   Player I  \       <- Label
    ┌───────────────┐
   /   ╭─────────╮   \
  │   │  ~ ~ ~ ~  │   │    <- Sloshing animated waves (.w1, .w2)
  │   │ ~~~~~~~~~ │   │    <- Dynamic liquid height (--fill)
  │   │~~~~~~~~~~~│   │
   \   ╰─────────╯   /     <- Glass specular gloss (.orb-gloss)
    └───────────────┘
          [ 42 ]           <- Active glowing score counter
```

### Fluid Math:
```typescript
const pct = Math.max(7, Math.min(100, (score / MAX_ORB) * 100));
```
- Minimum liquid level is clamped at 7% so the orb never appears completely empty.
- Passed as a CSS custom property: `--fill: ${pct}%`.
- Waves animate via rotating offset squircle border-radii (`border-radius: 43% 47% 44% 46%` rotating at 4s and 7s intervals).

---

## 4. Directional Sowing Panel (`#dir-ui`)

When a player selects a cell to sow, the center HUD presents directional sowing controls ([src/App.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/App.tsx#L247-L285)):
- **Left Action Button (`.sow-left`)**:
  - Traversal: Clockwise (`cw`).
  - Shortcut: `Q` / `ArrowLeft` / `A`.
  - Icon: `⟵`.
- **Center Disc (`.sow-center-disc`)**:
  - Displays selected cell number: `Ô [N]`.
  - Cancel button: `✕ Hủy (Esc)`.
- **Right Action Button (`.sow-right`)**:
  - Traversal: Counter-Clockwise (`ccw`).
  - Shortcut: `E` / `ArrowRight` / `D`.
  - Icon: `⟶`.

---

## 5. Grimoire Tome Modal & Accessible Dialog Architecture

A comprehensive in-game rulebook styled as an ancient leather-bound tome with brass hinges, architected according to modern W3C WAI-ARIA modal dialog best practices:
- **ARIA Semantics**: Marked with `role="dialog"`, `aria-modal="true"`, and labeled via `aria-labelledby="grimoire-dialog-title"`.
- **Keyboard Focus Trap**: When open, a dedicated `useEffect` captures `Tab` and `Shift+Tab` keystrokes, keeping keyboard focus strictly within the modal's interactive controls (close button, tabs, and back button).
- **Focus Restoration**: When the user closes the modal (via `Esc`, clicking outside, or clicking the close button), focus is automatically restored to the triggering button (`#grimoire-btn`).
- **Tab Structure**:
  - **Tab 1: Ritual (Nghi Lễ)**: Explains the objective, citizen souls (1 pt), and Mandarin souls (10 pts).
  - **Tab 2: Reaping (Đoạt Hồn)**: Explains the 5-step skip-capture (*ăn luồn*) rule and continuous reaping chains.
  - **Tab 3: Mandarin (Luật Ô Quan)**: Explains Mandarin cell stopping rules and Mandarin slaying bonuses.
  - **Tab 4: Debt (Nợ Hồn / Rải Quân)**: Explains stone borrowing penalties when all 5 cells are exhausted.
  - **Tab 5: Controls (Phím Điều Khiển)**: Full interactive keymap.

### Reduced Motion Support (`prefers-reduced-motion`):
In [src/style.css](file:///Users/phucdo/Documents/projects/oanquan/src/style.css), a dedicated `@media (prefers-reduced-motion: reduce)` block disables heavy animations, wave rotations, and transitions for motion-sensitive users.

---

## 6. Complete Keyboard Shortcut Map

Implemented in [src/App.tsx](file:///Users/phucdo/Documents/projects/oanquan/src/App.tsx#L124-L178):

| Key Binding | Functionality | Context |
|-------------|---------------|---------|
| `1` – `5` | Quick-select citizen cell 1 through 5 for active player | Gameplay idle |
| `Q` / `←` / `A` | Sow Clockwise (`cw`) | Cell selected |
| `E` / `→` / `D` | Sow Counter-Clockwise (`ccw`) | Cell selected |
| `Esc` | Cancel cell selection OR close Grimoire | Any |
| `T` | Toggle Tactical Top-Down vs Cinematic Camera | Any |
| `L` | Toggle Language (Tiếng Việt / English) | Any |
| `H` / `?` | Open / Close Grimoire Tome of Rules | Any |
| `M` | Toggle Audio Mute | Any |
| `R` | Restart Board & Reset Scores | Gameplay idle |
| Pointer Drag | Drag cell laterally to choose sowing direction | Cell hover |
