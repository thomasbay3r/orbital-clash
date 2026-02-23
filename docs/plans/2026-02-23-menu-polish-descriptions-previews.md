# Menu Polish: Mode Descriptions + Map Previews + Button Layout

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the main menu by adding mode descriptions in the mode boxes, programmatic map preview minimaps in the map boxes, and a more compact button layout.

**Architecture:** All changes in `renderer.ts` drawMenu(). Mode descriptions stored as a simple array in the render method. Map previews rendered programmatically from existing `MAPS` data — no external assets. Bottom buttons reorganized from 4 vertical rows into 2 horizontal rows.

**Tech Stack:** TypeScript, Canvas API, Vite

---

## Feature 1: Mode Descriptions in Boxes

**Current:** 8 modes in 2x4 grid, 140x36px boxes, name only.

**New:** Boxes enlarged to 140x58px. Name (bold 12px) at top, short description (10px, dimmed) below.

### Mode Descriptions (German)

| Index | Name | Description |
|-------|------|-------------|
| 0 | Deathmatch | Meiste Kills gewinnt |
| 1 | King of Asteroid | Halte die Zone, sammle Punkte |
| 2 | Gravity Shift | Gravitation wechselt zufaellig |
| 3 | Duel | 1v1, beste aus 5 Runden |
| 4 | Asteroid Tag | Wer den Asteroiden hat, verliert HP |
| 5 | Survival Wave | Ueberlebe Gegnerwellen |
| 6 | Hot Potato | Wirf die Bombe weiter! |
| 7 | Capture Core | Bringe den Kern zur Basis |

## Feature 2: Map Preview Minimaps

**Current:** 6 maps in 2x3 grid, 155x36px boxes, name only.

**New:** Boxes enlarged to 155x110px. Name (12px) at top, programmatic minimap (~155x85px) below.

### Minimap Rendering

- Background: `#0a0a1a`
- Scale map coordinates proportionally to fit the preview area
- Gravity wells: filled circles with radial gradient (orange center → transparent edge), size proportional to `radius`
- Asteroids: small gray filled circles, proportional to `radius`
- Portals: colored rings (use portal's `color` property)
- Arena boundary: thin dim border line
- Data source: import `MAPS` from `shared/maps.ts` — no duplication

## Feature 3: Compact Button Layout

**Current:** 4 vertical button rows (Weiter, Multiplayer, Profil, QuickPlay+Freunde) consuming ~160px.

**New:** 2 horizontal rows:

```
Row 1:  [ WEITER ]  [ MULTIPLAYER ]  [ QUICK PLAY ]
Row 2:     [ Profil/Anmelden ]   [ Freunde ]
```

Saves ~60px vertically.

## Menu Layout (Y positions)

```
Y=100   ORBITAL CLASH + Subtitle
Y=180   SELECT SHIP    [4x 130x100]          → ends ~Y=320
Y=340   SELECT MAP     [6x 155x110, 2x3]     → ends ~Y=565
Y=580   SELECT MODE    [8x 140x58, 2x4]      → ends ~Y=700
Y=720   [ WEITER ] [ MULTIPLAYER ] [ QUICK PLAY ]
Y=760   [ Profil/Anmelden ] [ Freunde ]
Y=800   Controls text
```

## Files to Modify

- `src/client/rendering/renderer.ts` — drawMenu() method only

## No Changes To

- Server code, game logic, types, maps data, constants
- No new files, no new dependencies
