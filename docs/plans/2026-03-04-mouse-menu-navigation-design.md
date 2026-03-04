# Design: Vollständige Mausbedienung in Menüs

**Datum:** 2026-03-04
**Status:** Approved

## Problemstellung

Einige Menü-Aktionen in Orbital Clash sind ausschließlich per Tastatur erreichbar:
1. Tutorial-Overlays und -Banner lassen sich nicht per Mausklick dismissen
2. Der Help-Screen hat keine klickbaren Buttons (nur Text-Hints `[Escape]`, `[R]`)
3. Der Help-Screen ist nur via `H`-Taste erreichbar, kein Button im Hauptmenü
4. Einige weitere Screens (Challenges, Cosmetics, Profile, Friends, Party-Lobby, Online-Lobby) könnten fehlende Back-Buttons haben

## Bestehende Architektur

- Canvas-basiertes Spiel, kein DOM für UI
- `drawMenuButton(ctx, cx, cy, bw, bh, label, color, id, mx, my)` registriert automatisch Click-Regions in `this.menuClickRegions[]`
- `handleMenuClick(mx, my)` → `hitTestLocal(mx, my)` → Switch über Screen-spezifische Button-IDs
- Tutorial-Status: `tutorialActive` (Typ `"overlay"` oder `"banner"`), dismissed via `markTutorialSeen()` / `disableTutorial()`

## Lösung

### 1. Tutorial-Overlay — Klick-Dismiss

**Wo:** `handleMenuClick()` — ganz oben, vor allen Screen-Checks

```typescript
// Ganz oben in handleMenuClick:
if (this.tutorialActive) {
  const config = TUTORIAL_SCREENS.find(s => s.id === this.tutorialActive);
  if (config?.type === "overlay") {
    // Klick irgendwo dismissed das Overlay (= Enter-Taste)
    this.markTutorialSeen(this.tutorialActive);
    return;
  }
  if (config?.type === "banner") {
    // Klick im Banner-Bereich (y < 50px) dismisst
    if (my < 50) {
      this.markTutorialSeen(this.tutorialActive);
      return;
    }
  }
}
```

**Rendering-Änderung:** Tutorial-Overlay erhält sichtbaren "[Klick oder Enter] OK"-Hinweis, kein struktureller Change.

### 2. Help-Screen — Klickbare Buttons

**Wo:** `drawHelp()` — Text-Hints durch `drawMenuButton`-Aufrufe ersetzen

```typescript
// Vorher:
ctx.fillText("[Escape] " + t("help.back"), w / 2, y);

// Nachher:
this.drawMenuButton(ctx, w/2, y, 200, 36, t("help.back"), COLORS.uiDim, "button-help-back", mx, my);
this.drawMenuButton(ctx, w/2, y - 50, 280, 36, t("help.resetTutorial"), COLORS.ui, "button-help-reset", mx, my);
```

**Neuer Click-Handler in `handleMenuClick()`:**
```typescript
} else if (this.screen === "help") {
  const hit = this.hitTestLocal(mx, my);
  if (hit === "button-help-back") this.screen = "menu";
  if (hit === "button-help-reset") {
    this.tutorialSeen.clear();
    this.tutorialEnabled = true;
    this.firstGameStarted = false;
    this.saveTutorialState();
    this.tutorialResetFeedback = 2;
  }
}
```

### 3. Hilfe-Button im Hauptmenü

**Wo:** Menü-Overlay (in `drawMenuOverlay()` oder wo die Hub-Buttons gezeichnet werden)

- Kleiner, dezenter Button (z.B. `"?"` oder `"Hilfe"`) — unten rechts oder neben existierenden Buttons
- ID: `"button-help"`
- Click-Handler in `handleMenuClick()` für `"menu"` Screen: `if (hit === "button-help") this.screen = "help";`

### 4. Audit der restlichen Screens

Für jeden Screen prüfen ob ein Back-Button fehlt:

| Screen | Back-Aktion | Button vorhanden? |
|--------|-------------|-------------------|
| challenges | `ESCAPE → profile` | Prüfen, ggf. hinzufügen |
| cosmetics | `ESCAPE → profile` | Prüfen, ggf. hinzufügen |
| profile | `ESCAPE → menu` | Prüfen, ggf. hinzufügen |
| friends | `ESCAPE → menu` | Prüfen, ggf. hinzufügen |
| party-lobby | `ESCAPE → menu` | Prüfen, ggf. hinzufügen |
| online-lobby | `ESCAPE → mod-select` | Prüfen, ggf. hinzufügen |

Für jeden fehlenden Back-Button: `drawMenuButton(..., "button-<screen>-back", ...)` + Click-Handler.

## Nicht im Scope

- In-Game-UI (Emote-Wheel, Chat) bleibt keyboard-only
- Gameplay-Aktionen (Schießen, Bewegen)

## Testbarkeit

- E2E-Test: Tutorial-Overlay durch Mausklick dismissbar
- E2E-Test: Help-Screen über Menü-Klick erreichbar, Buttons funktionieren
- E2E-Test: Alle Back-Buttons auf Screens klickbar (Navigation per Maus ohne Tastatur)

## Dateien betroffen

- `src/client/game/game.ts` — handleMenuClick, drawHelp, drawMenuOverlay/Hub, ggf. drawChallenges, drawCosmetics, drawProfile, drawFriends
- `src/client/rendering/renderer.ts` — ggf. Hub-Buttons
- `e2e/` — neue Tests für Maus-Navigation
