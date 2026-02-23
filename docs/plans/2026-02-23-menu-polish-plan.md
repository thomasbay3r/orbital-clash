# Menu Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the main menu by adding mode descriptions in boxes, programmatic map preview minimaps, and a compact button layout.

**Architecture:** All changes in `src/client/rendering/renderer.ts` drawMenu() method (lines 1016-1187). Mode descriptions as a local array. Map previews rendered from imported `MAPS` data. Buttons reorganized into 2 horizontal rows.

**Tech Stack:** TypeScript, Canvas API, Vite

---

## Task 1: Enlarge Mode Boxes and Add Descriptions

**Files:**
- Modify: `src/client/rendering/renderer.ts:1124-1158`

**Step 1: Update mode section Y position and box dimensions**

Replace the mode selection block (lines 1124-1158) with enlarged boxes and descriptions:

```typescript
    // Mode selection (2 rows of 4)
    const modeNames = ["Deathmatch", "King of Asteroid", "Gravity Shift", "Duel",
      "Asteroid Tag", "Survival Wave", "Hot Potato", "Capture Core"];
    const modeDescs = [
      "Meiste Kills gewinnt",
      "Halte die Zone, sammle Punkte",
      "Gravitation wechselt zufaellig",
      "1v1, beste aus 5 Runden",
      "Wer den Asteroiden hat, verliert HP",
      "Ueberlebe Gegnerwellen",
      "Wirf die Bombe weiter!",
      "Bringe den Kern zur Basis",
    ];
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("SELECT MODE", w / 2, 580);

    for (let i = 0; i < modeNames.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const bx = w / 2 - 310 + col * 155;
      const by = 595 + row * 67;
      const bw = 140;
      const bh = 58;
      const isSelected = i === selectedMode;
      const isHovered = hoveredId === `mode-${i}`;

      ctx.strokeStyle = isSelected ? COLORS.nova : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = COLORS.nova + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      ctx.font = "bold 12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(modeNames[i], bx + bw / 2, by + 20);

      ctx.font = "10px monospace";
      ctx.fillStyle = isSelected ? COLORS.uiDim : (isHovered ? COLORS.uiDim : "#555577");
      ctx.fillText(modeDescs[i], bx + bw / 2, by + 40);

      this.clickRegions.push({ x: bx, y: by, width: bw, height: bh, id: `mode-${i}` });
    }
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type changes, just rendering values)

---

## Task 2: Enlarge Map Boxes and Add Minimap Previews

**Files:**
- Modify: `src/client/rendering/renderer.ts:1089-1122`

**Step 1: Replace the map selection block with enlarged boxes and minimaps**

Replace lines 1089-1122 with:

```typescript
    // Map selection (2 rows of 3)
    const mapIds: Array<keyof typeof MAPS> = [
      "nebula-station", "asteroid-belt", "the-singularity",
      "black-hole", "wormhole-station", "debris-field",
    ];
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText("SELECT MAP", w / 2, 340);

    for (let i = 0; i < mapIds.length; i++) {
      const map = MAPS[mapIds[i]];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx = w / 2 - 250 + col * 170;
      const by = 355 + row * 119;
      const bw = 155;
      const bh = 110;
      const isSelected = i === selectedMap;
      const isHovered = hoveredId === `map-${i}`;

      // Box outline and fill
      ctx.strokeStyle = isSelected ? COLORS.gravityWell : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, bw, bh);

      if (isSelected) {
        ctx.fillStyle = COLORS.gravityWell + "15";
        ctx.fillRect(bx, by, bw, bh);
      } else if (isHovered) {
        ctx.fillStyle = COLORS.ui + "08";
        ctx.fillRect(bx, by, bw, bh);
      }

      // Map name
      ctx.font = "12px monospace";
      ctx.fillStyle = isSelected ? COLORS.ui : (isHovered ? COLORS.ui : COLORS.uiDim);
      ctx.fillText(map.name, bx + bw / 2, by + 16);

      // Minimap area
      const mx = bx + 4;
      const my = by + 23;
      const mw = bw - 8;
      const mh = bh - 27;

      // Minimap background
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(mx, my, mw, mh);

      // Scale factor
      const scaleX = mw / map.width;
      const scaleY = mh / map.height;
      const s = Math.min(scaleX, scaleY);
      const ox = mx + (mw - map.width * s) / 2;
      const oy = my + (mh - map.height * s) / 2;

      // Arena boundary
      ctx.strokeStyle = "#333355";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(ox, oy, map.width * s, map.height * s);

      // Gravity wells
      for (const gw of map.gravityWells) {
        const gx = ox + gw.position.x * s;
        const gy = oy + gw.position.y * s;
        const gr = Math.max(gw.radius * s, 3);
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        grad.addColorStop(0, "rgba(255, 160, 0, 0.6)");
        grad.addColorStop(1, "rgba(255, 160, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Asteroids
      for (const ast of map.asteroids) {
        const ax = ox + ast.position.x * s;
        const ay = oy + ast.position.y * s;
        const ar = Math.max(ast.radius * s, 1.5);
        ctx.fillStyle = "#667788";
        ctx.beginPath();
        ctx.arc(ax, ay, ar, 0, Math.PI * 2);
        ctx.fill();
      }

      // Portals
      if (map.portals) {
        for (const portal of map.portals) {
          const px = ox + portal.position.x * s;
          const py = oy + portal.position.y * s;
          const pr = Math.max(portal.radius * s, 2.5);
          ctx.strokeStyle = portal.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      this.clickRegions.push({ x: bx, y: by, width: bw, height: bh, id: `map-${i}` });
    }
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 3: Compact Button Layout

**Files:**
- Modify: `src/client/rendering/renderer.ts:1160-1174`

**Step 1: Replace vertical buttons with 2 horizontal rows**

Replace lines 1160-1174 with:

```typescript
    // Row 1: Weiter + Multiplayer + Quick Play
    this.drawButton(ctx, w / 2 - 160, 740, 150, 40, "Weiter", COLORS.ui, "button-weiter", hoveredId);
    this.drawButton(ctx, w / 2, 740, 150, 40, "Multiplayer", COLORS.uiDim, "button-online", hoveredId);
    this.drawButton(ctx, w / 2 + 160, 740, 150, 40, "Quick Play", COLORS.uiDim, "button-quickplay", hoveredId);

    // Row 2: Profil/Anmelden + Freunde
    const accountLabel = this.accountButtonLabel;
    if (accountLabel) {
      this.drawButton(ctx, w / 2 - 90, 788, 160, 32, accountLabel, "#ffaa00", "button-account", hoveredId);
    }
    this.drawButton(ctx, w / 2 + 90, 788, 140, 32, "Freunde", COLORS.uiDim, "button-friends", hoveredId);
```

**Step 2: Update controls text Y position**

Change the controls text to use `h - 50` (already uses this, so no change needed — it's anchored to bottom).

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Task 4: Run All Tests and Fix If Needed

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Run unit tests**

Run: `npm test`
Expected: All pass (no logic changes)

**Step 3: Run E2E tests**

Run: `npm run test:e2e`
Expected: All pass (E2E tests check game state, not pixel positions)

---

## Task 5: Visual Verification

**Step 1: Start dev server and check menu**

Run: `npm run dev:client -- --port 4174`

Open browser and verify:
- Mode boxes show name (bold) + description (dimmed) in each box
- Map boxes show name + minimap with gravity wells (orange), asteroids (gray), portals (colored rings)
- Buttons arranged in 2 rows: [Weiter][Multiplayer][Quick Play] and [Profil][Freunde]
- All boxes are clickable and highlight on hover/selection
- No overlapping elements

**Step 2: Commit**

```bash
git add src/client/rendering/renderer.ts
git commit -m "feat: add mode descriptions, map minimaps, compact button layout in menu"
```
