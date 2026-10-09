# Context 10: Internationalization & Lore Glossary

This document details the localization architecture, cultural context, and bilingual terminology implemented in [src/i18n.ts](file:///Users/phucdo/Documents/projects/oanquan/src/i18n.ts).

---

## 1. Localization Architecture

Internationalization is managed via a dedicated Zustand store (`useI18n`) with browser persistence:
- **Default Language**: Vietnamese (`vi`), honoring the cultural heritage of the game.
- **Secondary Language**: English (`en`).
- **Persistence Key**: `'oanquan_lang'` in browser `localStorage`.
- **Reactive Hook**:
  ```typescript
  const lang = useI18n(s => s.lang);
  const toggleLang = useI18n(s => s.toggleLang);
  const t = translations[lang];
  ```
- **Hot-Swapping**: Language toggling (via `L` key or the top HUD button) immediately updates all HUD labels, Grimoire chapters, combat banners, and victory announcements without reloading the page or resetting game state.

---

## 2. Cultural & Dark Fantasy Terminology Glossary

The game bridges traditional Vietnamese folk gaming with gothic dark fantasy. This glossary provides the canonical mappings across all three contexts:

| Traditional Vietnamese Folk Term | Dark Fantasy Vietnamese (In-Game) | Dark Fantasy English (In-Game) | Engine / Code Concept |
|----------------------------------|------------------------------------|--------------------------------|-----------------------|
| **Ô Ăn Quan** | **Điện Thờ Các Quan Tiền Triều** | **Altar of the Fallen Mandarins** | Game Title |
| **Dân** (Small Pebble) | **Quân Hồn** | **Soul Shard** | `value = 1` stone |
| **Quan** (Mandarin Stone) | **Chúa Tể Tiền Triều** | **Fallen Mandarin** | `value = 10` stone |
| **Ô Dân** (Citizen Square) | **Ô Hồn** | **Soul Chamber** | Cells `0..4`, `6..10` |
| **Ô Quan** (Mandarin Semicircle) | **Điện Tế Quan** | **Sanctum of the Mandarin** | Cells `5`, `11` |
| **Rải quân** | **Nghi Lễ Rải Hồn** | **Sowing Ritual** | Sowing loop (`sow`) |
| **Ăn luồn** (Skip capture) | **Đoạt Hồn** | **Soul Reaping** | `captureSequence` |
| **Ăn đôi** | **Ăn Đôi** | **Double Reap** | `combo === 2` |
| **Ăn ba** | **Ăn Ba** | **Triple Reap** | `combo === 3` |
| **Ăn nhiều ô** | **Đại Thu Hoạch** | **Soul Harvest** | `combo >= 4` |
| **Ăn hết ô Quan** | **Đã Đập Tan Ô Quan!** | **Mandarin Slain!** | Reaping Mandarin pit |
| **Rải quân khi hết quân** | **Rải Quân — Nợ Hồn** | **Souls Borrowed / Altar Debt** | −5 score penalty rule |
| **Nhà chứa quân ăn** | **Đài Tế** | **Tribute Pedestal** | `CAPTURE_POS` |
| **Luật chơi** | **Sách Bí Pháp & Điển Tích** | **Grimoire & Ancient Lore** | Grimoire modal |
| **Cùng chiều KĐH** | **Cùng Chiều KĐH (Trái)** | **Clockwise (Left)** | `'cw'` direction |
| **Ngược chiều KĐH** | **Ngược Chiều KĐH (Phải)** | **Counter-Clockwise (Right)** | `'ccw'` direction |

---

## 3. Translation Schema Structure

The dictionary is strongly typed via `translations` in [src/i18n.ts](file:///Users/phucdo/Documents/projects/oanquan/src/i18n.ts#L42-L223):

```typescript
export interface TranslationMap {
  title: string;
  kicker: string;
  sub: string;
  enterBtn: string;
  titleTip: string;
  playerI: string;
  playerII: string;
  statusSilent: string;
  statusSowing: string;
  statusChooseDir: string;
  statusSelectCell: string;
  sowCW: string;
  sowCCW: string;
  sowLeft: string;
  sowRight: string;
  cell: string;
  cancel: string;
  grimoireBtn: string;
  tacticalBtn: string;
  cinematicBtn: string;
  muteBtn: string;
  unmuteBtn: string;
  restartBtn: string;
  langToggle: string;
  fightAgain: string;
  winP1Title: string;
  winP2Title: string;
  winKicker: string;
  drawTitle: string;
  drawKicker: string;
  // Grimoire chapters & lore text
  grimoireHeaderKicker: string;
  grimoireHeaderTitle: string;
  tabRitual: string;
  tabReaping: string;
  tabMandarin: string;
  tabDebt: string;
  tabControls: string;
  // ... rules breakdown strings
}
```

---

## 4. Recipe: Adding a New Language (e.g. French / Japanese)

To introduce a new language (e.g. `'fr'`):
1. Expand the `Lang` union type in [src/i18n.ts](file:///Users/phucdo/Documents/projects/oanquan/src/i18n.ts#L3):
   ```typescript
   export type Lang = 'vi' | 'en' | 'fr';
   ```
2. Add the translation dictionary entry to `translations`:
   ```typescript
   export const translations = {
     vi: { ... },
     en: { ... },
     fr: {
       title: "Ô Ăn Quan",
       kicker: "— Le rite sacré des Mandarins Déchus —",
       // ...
     }
   };
   ```
3. Update `toggleLang()` to cycle through the expanded list:
   ```typescript
   const cycle: Record<Lang, Lang> = { vi: 'en', en: 'fr', fr: 'vi' };
   set({ lang: cycle[get().lang] });
   ```
