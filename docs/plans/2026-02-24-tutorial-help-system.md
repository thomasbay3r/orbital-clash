# Tutorial/Help System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable tutorial system that explains features on first encounter, plus a help screen with game overview.

**Architecture:** Hybrid approach — blocking fullscreen overlays for complex screens (game-config, mod-select, settings, first gameplay), non-blocking banners for simple screens (profile, challenges, cosmetics, friends, party, emotes, scoreboard). Tutorial state persisted in localStorage (guests) and D1 database (accounts). New help screen accessible via H key from menu.

**Tech Stack:** TypeScript, HTML5 Canvas, Cloudflare Workers + D1, Vitest

---

### Task 1: Tutorial Config & i18n Translations

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/lang/de.ts`
- Modify: `src/shared/lang/en.ts`

**Context:** All tutorial hint text lives in the i18n system. We define a `TUTORIAL_SCREENS` config array mapping screen IDs to their tutorial type (overlay vs banner) and translation key. This follows the existing config pattern (like `MUTATOR_CONFIGS`).

**Step 1: Add TUTORIAL_SCREENS config to constants.ts**

Add at end of file, before the closing exports:

```typescript
// ===== Tutorial =====
export type TutorialScreenId =
  | "game-config" | "mod-select" | "settings" | "first-gameplay"
  | "profile" | "challenges" | "cosmetics" | "friends"
  | "party-lobby" | "emote-wheel" | "scoreboard";

export const TUTORIAL_SCREENS: { id: TutorialScreenId; type: "overlay" | "banner" }[] = [
  { id: "game-config", type: "overlay" },
  { id: "mod-select", type: "overlay" },
  { id: "settings", type: "overlay" },
  { id: "first-gameplay", type: "overlay" },
  { id: "profile", type: "banner" },
  { id: "challenges", type: "banner" },
  { id: "cosmetics", type: "banner" },
  { id: "friends", type: "banner" },
  { id: "party-lobby", type: "banner" },
  { id: "emote-wheel", type: "banner" },
  { id: "scoreboard", type: "banner" },
];
```

**Step 2: Add German tutorial translations to `src/shared/lang/de.ts`**

Add before the `"lang.toggle"` line at end of file:

```typescript
  // ===== Tutorial =====
  "tutorial.ok": "[Enter] OK",
  "tutorial.dismiss": "[T] Tutorial aus",
  "tutorial.overlay.gameConfig": "Waehle dein Schiff (1-4), Karte (Q/E) und Modus (Z/C). Enter = Weiter.",
  "tutorial.overlay.modSelect": "Waehle Waffen-, Schiff- und Passiv-Mod fuer deinen Loadout. Klicke oder nutze die Tastatur.",
  "tutorial.overlay.settings": "Stelle Schwierigkeit (Q/E), Bot-Anzahl (W/S) und Mutatoren ein. Enter = Starten!",
  "tutorial.overlay.firstGameplay": "WASD = Bewegen | Maus = Zielen | Klick = Schiessen | Rechtsklick = Spezial | Shift = Boost. Vorsicht vor Gravitationsfeldern!",
  "tutorial.banner.profile": "Dein Profil: Fortschritt und Statistiken. C = Challenges, K = Cosmetics.",
  "tutorial.banner.challenges": "Schliesse taegliche und woechentliche Challenges ab fuer XP-Belohnungen!",
  "tutorial.banner.cosmetics": "Schalte Skins, Trails und Effekte durch Leveln frei. 1-4 = Kategorie wechseln.",
  "tutorial.banner.friends": "Suche Spieler (S), fuege Freunde hinzu und sieh wer online ist.",
  "tutorial.banner.partyLobby": "Party-Lobby: Warte auf Mitspieler. Leader waehlt Einstellungen und startet.",
  "tutorial.banner.emoteWheel": "Emote-Rad: Waehle ein Emote (1-8). V = Oeffnen/Schliessen.",
  "tutorial.banner.scoreboard": "Runden-Ergebnis: Enter = Rematch, Escape = Hauptmenue.",
  "help.title": "HILFE",
  "help.controls.title": "STEUERUNG",
  "help.controls.move": "WASD = Bewegen",
  "help.controls.aim": "Maus = Zielen",
  "help.controls.shoot": "Linksklick = Schiessen",
  "help.controls.special": "Rechtsklick / Leertaste = Spezial",
  "help.controls.boost": "Shift = Boost (verbraucht Energie)",
  "help.controls.emote": "V = Emote-Rad (1-8 waehlen)",
  "help.controls.chat": "T = Chat (Multiplayer)",
  "help.ships.title": "SCHIFFE",
  "help.ships.viper": "Viper: Schnell, 120 HP, Doppelschuss + Phasen-Sprint",
  "help.ships.titan": "Titan: Tank, 220 HP, Schwerer Schuss + Schutzschild",
  "help.ships.specter": "Specter: Disruptor, 150 HP, Lenkrakete + EMP-Puls",
  "help.ships.nova": "Nova: Zonenkontrolle, 150 HP, Streuschuss + Grav.-Bombe",
  "help.modes.title": "SPIELMODI",
  "help.modes.list": "Deathmatch | King of Asteroid | Gravity Shift | Duel | Asteroid Tag | Survival Wave | Hot Potato | Capture Core",
  "help.mutators.title": "MUTATOREN",
  "help.mutators.desc": "Mutatoren veraendern die Spielregeln: Hypergravity, Zero-G, Big Head, Ricochet, Glass Cannon, Mystery Loadout, Fog of War, Speed Demon, Friendly Fire, Mirror Match.",
  "help.social.title": "SOCIAL",
  "help.social.desc": "F = Freunde | N = Party erstellen | J = Party beitreten | P = Profil",
  "help.resetTutorial": "[R] Tutorial zuruecksetzen",
  "help.tutorialReset": "Tutorial zurueckgesetzt!",
  "help.back": "Zurueck",
```

**Step 3: Add English tutorial translations to `src/shared/lang/en.ts`**

Add matching keys with English translations before the `"lang.toggle"` line:

```typescript
  // ===== Tutorial =====
  "tutorial.ok": "[Enter] OK",
  "tutorial.dismiss": "[T] Disable tutorial",
  "tutorial.overlay.gameConfig": "Choose your ship (1-4), map (Q/E) and mode (Z/C). Enter = Continue.",
  "tutorial.overlay.modSelect": "Choose weapon, ship and passive mods for your loadout. Click or use keyboard.",
  "tutorial.overlay.settings": "Set difficulty (Q/E), bot count (W/S) and mutators. Enter = Start!",
  "tutorial.overlay.firstGameplay": "WASD = Move | Mouse = Aim | Click = Shoot | Right-click = Special | Shift = Boost. Watch out for gravity wells!",
  "tutorial.banner.profile": "Your profile: progress and statistics. C = Challenges, K = Cosmetics.",
  "tutorial.banner.challenges": "Complete daily and weekly challenges for XP rewards!",
  "tutorial.banner.cosmetics": "Unlock skins, trails and effects by leveling up. 1-4 = Switch category.",
  "tutorial.banner.friends": "Search players (S), add friends and see who's online.",
  "tutorial.banner.partyLobby": "Party lobby: Wait for teammates. Leader picks settings and starts.",
  "tutorial.banner.emoteWheel": "Emote wheel: Pick an emote (1-8). V = Open/Close.",
  "tutorial.banner.scoreboard": "Match results: Enter = Rematch, Escape = Main menu.",
  "help.title": "HELP",
  "help.controls.title": "CONTROLS",
  "help.controls.move": "WASD = Move",
  "help.controls.aim": "Mouse = Aim",
  "help.controls.shoot": "Left click = Shoot",
  "help.controls.special": "Right click / Space = Special",
  "help.controls.boost": "Shift = Boost (uses energy)",
  "help.controls.emote": "V = Emote wheel (pick 1-8)",
  "help.controls.chat": "T = Chat (Multiplayer)",
  "help.ships.title": "SHIPS",
  "help.ships.viper": "Viper: Fast, 120 HP, Dual Shot + Phase Dash",
  "help.ships.titan": "Titan: Tank, 220 HP, Heavy Shot + Shield Bubble",
  "help.ships.specter": "Specter: Disruptor, 150 HP, Homing Missile + EMP Pulse",
  "help.ships.nova": "Nova: Zone Control, 150 HP, Spread Shot + Gravity Bomb",
  "help.modes.title": "GAME MODES",
  "help.modes.list": "Deathmatch | King of Asteroid | Gravity Shift | Duel | Asteroid Tag | Survival Wave | Hot Potato | Capture Core",
  "help.mutators.title": "MUTATORS",
  "help.mutators.desc": "Mutators change the rules: Hypergravity, Zero-G, Big Head, Ricochet, Glass Cannon, Mystery Loadout, Fog of War, Speed Demon, Friendly Fire, Mirror Match.",
  "help.social.title": "SOCIAL",
  "help.social.desc": "F = Friends | N = Create party | J = Join party | P = Profile",
  "help.resetTutorial": "[R] Reset tutorial",
  "help.tutorialReset": "Tutorial has been reset!",
  "help.back": "Back",
```

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

**Step 5: Commit**

```bash
git add src/shared/constants.ts src/shared/lang/de.ts src/shared/lang/en.ts
git commit -m "feat(tutorial): add tutorial config and i18n translations"
```

---

### Task 2: Tutorial Config Completeness Tests

**Files:**
- Modify: `src/shared/security.test.ts` (or create `src/shared/tutorial.test.ts`)

**Context:** Follow the existing config completeness test pattern (see `security.test.ts` Mutator/Mode/Ship tests). Test that every `TUTORIAL_SCREENS` entry has matching i18n keys.

**Step 1: Write the test**

Create `src/shared/tutorial.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { TUTORIAL_SCREENS, TutorialScreenId } from "./constants";
import { de } from "./lang/de";
import { en } from "./lang/en";

describe("Tutorial Config Completeness", () => {
  const allIds: TutorialScreenId[] = [
    "game-config", "mod-select", "settings", "first-gameplay",
    "profile", "challenges", "cosmetics", "friends",
    "party-lobby", "emote-wheel", "scoreboard",
  ];

  it("should have a config for every TutorialScreenId", () => {
    for (const id of allIds) {
      const config = TUTORIAL_SCREENS.find((s) => s.id === id);
      expect(config).toBeDefined();
    }
  });

  it("should not have extra configs", () => {
    expect(TUTORIAL_SCREENS.length).toBe(allIds.length);
  });

  it("should have valid types", () => {
    for (const screen of TUTORIAL_SCREENS) {
      expect(["overlay", "banner"]).toContain(screen.type);
    }
  });

  it("overlays should have overlay translation keys", () => {
    const overlays = TUTORIAL_SCREENS.filter((s) => s.type === "overlay");
    const keyMap: Record<string, string> = {
      "game-config": "tutorial.overlay.gameConfig",
      "mod-select": "tutorial.overlay.modSelect",
      "settings": "tutorial.overlay.settings",
      "first-gameplay": "tutorial.overlay.firstGameplay",
    };
    for (const o of overlays) {
      const key = keyMap[o.id];
      expect(key).toBeDefined();
      expect((de as Record<string, string>)[key]).toBeDefined();
      expect((en as Record<string, string>)[key]).toBeDefined();
    }
  });

  it("banners should have banner translation keys", () => {
    const banners = TUTORIAL_SCREENS.filter((s) => s.type === "banner");
    const keyMap: Record<string, string> = {
      "profile": "tutorial.banner.profile",
      "challenges": "tutorial.banner.challenges",
      "cosmetics": "tutorial.banner.cosmetics",
      "friends": "tutorial.banner.friends",
      "party-lobby": "tutorial.banner.partyLobby",
      "emote-wheel": "tutorial.banner.emoteWheel",
      "scoreboard": "tutorial.banner.scoreboard",
    };
    for (const b of banners) {
      const key = keyMap[b.id];
      expect(key).toBeDefined();
      expect((de as Record<string, string>)[key]).toBeDefined();
      expect((en as Record<string, string>)[key]).toBeDefined();
    }
  });

  it("help screen should have all required translation keys", () => {
    const helpKeys = [
      "help.title", "help.controls.title", "help.controls.move",
      "help.controls.aim", "help.controls.shoot", "help.controls.special",
      "help.controls.boost", "help.controls.emote", "help.controls.chat",
      "help.ships.title", "help.ships.viper", "help.ships.titan",
      "help.ships.specter", "help.ships.nova",
      "help.modes.title", "help.modes.list",
      "help.mutators.title", "help.mutators.desc",
      "help.social.title", "help.social.desc",
      "help.resetTutorial", "help.tutorialReset", "help.back",
    ];
    for (const key of helpKeys) {
      expect((de as Record<string, string>)[key]).toBeDefined();
      expect((en as Record<string, string>)[key]).toBeDefined();
    }
  });
});
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass including new tutorial tests

**Step 3: Commit**

```bash
git add src/shared/tutorial.test.ts
git commit -m "test(tutorial): add config completeness tests"
```

---

### Task 3: Tutorial State Management in Game Class

**Files:**
- Modify: `src/client/game/game.ts`

**Context:** Add tutorial state fields to the Game class, plus localStorage save/load helpers. The `screen` field (line 60) tracks current screen. Tutorial state uses `tutorialEnabled` (boolean) and `tutorialSeen` (Set of TutorialScreenId). The `tutorialDismissing` field tracks the currently visible tutorial to handle dismissal.

**Step 1: Add imports and state fields**

At top of game.ts, add to existing constants import (line ~1):
```typescript
import { ..., TUTORIAL_SCREENS, TutorialScreenId } from "../../shared/constants";
```

Add `"help"` to the Screen type (line 30):
```typescript
type Screen = "menu" | "game-config" | "mod-select" | "settings" | "playing" | "online-lobby"
  | "friends" | "login" | "register" | "profile" | "post-game" | "matchmaking"
  | "challenges" | "cosmetics" | "mutator-roulette" | "party-lobby" | "tournament-bracket"
  | "help";
```

Add tutorial state fields to Game class (after line ~82, near existing state fields):
```typescript
  // Tutorial state
  private tutorialEnabled = true;
  private tutorialSeen = new Set<TutorialScreenId>();
  private tutorialActive: TutorialScreenId | null = null; // Currently showing tutorial
  private tutorialResetFeedback = 0; // Timer for "Tutorial reset!" message in help screen
  private firstGameStarted = false; // Track if this is the player's first game ever
```

**Step 2: Add localStorage save/load methods**

Add after the tutorial state fields:
```typescript
  private loadTutorialState(): void {
    try {
      const enabled = localStorage.getItem("tutorialEnabled");
      if (enabled !== null) this.tutorialEnabled = enabled === "true";
      const seen = localStorage.getItem("tutorialSeen");
      if (seen) this.tutorialSeen = new Set(JSON.parse(seen));
    } catch { /* ignore corrupt data */ }
  }

  private saveTutorialState(): void {
    localStorage.setItem("tutorialEnabled", String(this.tutorialEnabled));
    localStorage.setItem("tutorialSeen", JSON.stringify([...this.tutorialSeen]));
  }

  private markTutorialSeen(id: TutorialScreenId): void {
    this.tutorialSeen.add(id);
    this.tutorialActive = null;
    this.saveTutorialState();
    // Async save to server for logged-in users
    if (this.api.isAccount) {
      this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
    }
  }

  private disableTutorial(): void {
    this.tutorialEnabled = false;
    this.tutorialActive = null;
    this.saveTutorialState();
    if (this.api.isAccount) {
      this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
    }
  }

  private shouldShowTutorial(id: TutorialScreenId): boolean {
    return this.tutorialEnabled && !this.tutorialSeen.has(id);
  }
```

**Step 3: Call loadTutorialState in constructor**

In the Game constructor (after existing localStorage loads like `local_xp`), add:
```typescript
    this.loadTutorialState();
```

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Will fail because `api.saveTutorialState` doesn't exist yet — that's OK, we add it in Task 7. For now, comment out the api calls or add a stub.

Actually, add a no-op stub to `src/client/network/api.ts`:
```typescript
  async saveTutorialState(_enabled: boolean, _seen: string[]): Promise<void> {
    // TODO: implement in Task 7
  }
```

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client/game/game.ts src/client/network/api.ts
git commit -m "feat(tutorial): add tutorial state management and localStorage persistence"
```

---

### Task 4: Banner Rendering & Integration

**Files:**
- Modify: `src/client/game/game.ts`

**Context:** Banners render at the top of the screen as a semi-transparent bar with tutorial text plus dismiss controls. They are non-blocking — the player can still interact with the screen beneath.

**Step 1: Add drawTutorialBanner method**

```typescript
  private drawTutorialBanner(ctx: CanvasRenderingContext2D, w: number, text: string): void {
    const bannerH = 44;
    // Semi-transparent dark background
    ctx.fillStyle = "rgba(10, 14, 39, 0.92)";
    ctx.fillRect(0, 0, w, bannerH);
    // Bottom border
    ctx.strokeStyle = COLORS.uiDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bannerH);
    ctx.lineTo(w, bannerH);
    ctx.stroke();
    // Tutorial text
    ctx.font = "14px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, 18);
    // Dismiss hints
    ctx.font = "13px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(`${t("tutorial.ok")}    ${t("tutorial.dismiss")}`, w / 2, 36);
  }
```

**Step 2: Integrate banners into draw methods**

For each banner screen, add a check at the END of its draw method (after all other rendering, so the banner draws on top). The pattern is:

```typescript
  // At end of drawProfile():
  if (this.shouldShowTutorial("profile")) {
    this.tutorialActive = "profile";
    this.drawTutorialBanner(ctx, w, t("tutorial.banner.profile"));
  }
```

Add this pattern to these draw methods:
- `drawProfile()` → `"profile"` / `"tutorial.banner.profile"`
- `drawChallenges()` → `"challenges"` / `"tutorial.banner.challenges"`
- `drawCosmetics()` → `"cosmetics"` / `"tutorial.banner.cosmetics"`
- `drawFriends()` → `"friends"` / `"tutorial.banner.friends"`
- `drawPartyLobby()` → `"party-lobby"` / `"tutorial.banner.partyLobby"`
- `drawScoreboard()` (post-game) → `"scoreboard"` / `"tutorial.banner.scoreboard"`

For emote wheel: in the emote drawing section (around line ~1960), add:
```typescript
  if (this.emoteWheelOpen && this.shouldShowTutorial("emote-wheel")) {
    this.tutorialActive = "emote-wheel";
    this.drawTutorialBanner(ctx, w, t("tutorial.banner.emoteWheel"));
  }
```

**Step 3: Add banner keyboard handling**

In the main keydown handler, add a check BEFORE the per-screen handling (after the chat input check, around line 423):

```typescript
    // Tutorial dismiss handling (banners)
    if (this.tutorialActive) {
      const config = TUTORIAL_SCREENS.find((s) => s.id === this.tutorialActive);
      if (config?.type === "banner") {
        if (key === "enter") {
          this.markTutorialSeen(this.tutorialActive);
          return;
        }
        if (key === "t" && !this.chatOpen) {
          this.disableTutorial();
          return;
        }
      }
    }
```

**Step 4: Run typecheck and unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client/game/game.ts
git commit -m "feat(tutorial): add non-blocking banner hints for simple screens"
```

---

### Task 5: Overlay Rendering & Integration

**Files:**
- Modify: `src/client/game/game.ts`

**Context:** Overlays are blocking — they cover the entire screen with a semi-transparent dark layer, show the tutorial text centered, and require Enter to dismiss. The game beneath is still visible but not interactive.

**Step 1: Add drawTutorialOverlay method**

```typescript
  private drawTutorialOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
    // Full-screen semi-transparent overlay
    ctx.fillStyle = "rgba(10, 14, 39, 0.85)";
    ctx.fillRect(0, 0, w, h);
    // Title
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = "#ffaa00";
    ctx.textAlign = "center";
    ctx.fillText("TUTORIAL", w / 2, h / 2 - 40);
    // Tutorial text (may be long, wrap it)
    ctx.font = "16px monospace";
    ctx.fillStyle = COLORS.ui;
    // Simple word-wrap for canvas
    const words = text.split(" ");
    const maxWidth = w - 100;
    let line = "";
    let y = h / 2;
    for (const word of words) {
      const testLine = line + (line ? " " : "") + word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, w / 2, y);
        line = word;
        y += 24;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, w / 2, y);
    // Dismiss hints
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = COLORS.uiDim;
    ctx.fillText(`${t("tutorial.ok")}    ${t("tutorial.dismiss")}`, w / 2, h / 2 + 80);
  }
```

**Step 2: Integrate overlays into draw methods**

For each overlay screen, add at the END of the draw method:

```typescript
  // At end of drawGameConfig() (the ship/map/mode selection screen):
  if (this.shouldShowTutorial("game-config")) {
    this.tutorialActive = "game-config";
    this.drawTutorialOverlay(ctx, w, h, t("tutorial.overlay.gameConfig"));
  }
```

Add this pattern to:
- Ship/map/mode selection draw method → `"game-config"` / `"tutorial.overlay.gameConfig"`
- `drawModSelect()` → `"mod-select"` / `"tutorial.overlay.modSelect"`
- `drawSettings()` → `"settings"` / `"tutorial.overlay.settings"`

For first gameplay: in the main game render loop, check once when gameplay starts:
```typescript
  // In the playing/game draw section, when game just started:
  if (!this.firstGameStarted && this.shouldShowTutorial("first-gameplay")) {
    this.firstGameStarted = true;
    this.tutorialActive = "first-gameplay";
  }
  // Then in the draw call for playing state:
  if (this.tutorialActive === "first-gameplay") {
    this.drawTutorialOverlay(ctx, w, h, t("tutorial.overlay.firstGameplay"));
  }
```

**Step 3: Add overlay keyboard handling**

Update the tutorial dismiss handling block (added in Task 4) to also handle overlays:

```typescript
    // Tutorial dismiss handling (overlays block all input)
    if (this.tutorialActive) {
      const config = TUTORIAL_SCREENS.find((s) => s.id === this.tutorialActive);
      if (config?.type === "overlay") {
        if (key === "enter") {
          this.markTutorialSeen(this.tutorialActive);
          return; // Block all other input
        }
        if (key === "t") {
          this.disableTutorial();
          return;
        }
        return; // Block all other keys during overlay
      }
      // Banner handling (non-blocking, from Task 4)
      if (config?.type === "banner") {
        if (key === "enter") {
          this.markTutorialSeen(this.tutorialActive);
          return;
        }
        if (key === "t" && !this.chatOpen) {
          this.disableTutorial();
          return;
        }
      }
    }
```

**Step 4: Run typecheck and tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client/game/game.ts
git commit -m "feat(tutorial): add blocking overlay hints for complex screens"
```

---

### Task 6: Help Screen (H Key)

**Files:**
- Modify: `src/client/game/game.ts`

**Context:** New screen accessible via H key from menu. Shows compact overview of controls, ships, modes, mutators, social. Has a "Reset Tutorial" button.

**Step 1: Add H key handler in menu**

In the menu keydown handler (around line 424), add:
```typescript
      if (key === "h") this.screen = "help";
```

**Step 2: Add drawHelp method**

```typescript
  private drawHelp(): void {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width = window.innerWidth;
    const h = this.canvas.height = window.innerHeight;
    this.menuClickRegions = [];
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.font = "bold 36px monospace";
    ctx.fillStyle = COLORS.ui;
    ctx.fillText(t("help.title"), w / 2, 60);

    ctx.textAlign = "left";
    const x = w / 2 - 300;
    let y = 110;
    const section = (title: string, color: string) => {
      ctx.font = "bold 16px monospace";
      ctx.fillStyle = color;
      ctx.fillText(title, x, y);
      y += 24;
    };
    const line = (text: string) => {
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.ui;
      ctx.fillText(text, x + 10, y);
      y += 20;
    };
    const dimLine = (text: string) => {
      ctx.font = "14px monospace";
      ctx.fillStyle = COLORS.uiDim;
      ctx.fillText(text, x + 10, y);
      y += 20;
    };

    // Controls
    section(t("help.controls.title"), "#ffaa00");
    line(t("help.controls.move"));
    line(t("help.controls.aim"));
    line(t("help.controls.shoot"));
    line(t("help.controls.special"));
    line(t("help.controls.boost"));
    line(t("help.controls.emote"));
    line(t("help.controls.chat"));
    y += 10;

    // Ships
    section(t("help.ships.title"), "#00f0ff");
    line(t("help.ships.viper"));
    line(t("help.ships.titan"));
    line(t("help.ships.specter"));
    line(t("help.ships.nova"));
    y += 10;

    // Modes
    section(t("help.modes.title"), "#44ff88");
    dimLine(t("help.modes.list"));
    y += 10;

    // Mutators
    section(t("help.mutators.title"), "#aa88ff");
    dimLine(t("help.mutators.desc"));
    y += 10;

    // Social
    section(t("help.social.title"), "#ff44aa");
    line(t("help.social.desc"));
    y += 20;

    // Reset tutorial button
    ctx.textAlign = "center";
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = this.tutorialResetFeedback > 0 ? "#44ff88" : COLORS.uiDim;
    ctx.fillText(
      this.tutorialResetFeedback > 0 ? t("help.tutorialReset") : t("help.resetTutorial"),
      w / 2, y,
    );
    y += 40;

    // Back button
    this.drawMenuButton(ctx, w / 2, y, 200, 40, t("help.back"), COLORS.uiDim, "button-help-back",
      this.input.mouseX, this.input.mouseY);
  }
```

**Step 3: Add help screen keyboard handler**

In the main keydown handler, add a new `else if` block for the help screen:
```typescript
    } else if (this.screen === "help") {
      if (key === "escape") this.screen = "menu";
      if (key === "r") {
        this.tutorialSeen.clear();
        this.tutorialEnabled = true;
        this.firstGameStarted = false;
        this.saveTutorialState();
        this.tutorialResetFeedback = 2; // 2 seconds feedback
      }
```

**Step 4: Add help screen to render loop**

In the main render/draw switch (wherever screens are dispatched to their draw methods), add:
```typescript
    if (this.screen === "help") this.drawHelp();
```

**Step 5: Add click handler for back button**

In the click handler, add for the help screen:
```typescript
    if (this.screen === "help" && clickedId === "button-help-back") {
      this.screen = "menu";
    }
```

**Step 6: Decrement tutorialResetFeedback timer**

In the game update loop (where deltaTime is available), add:
```typescript
    if (this.tutorialResetFeedback > 0) this.tutorialResetFeedback -= dt;
```

**Step 7: Run typecheck and tests**

Run: `npx tsc --noEmit && npm test && npm run test:e2e`
Expected: PASS

**Step 8: Commit**

```bash
git add src/client/game/game.ts
git commit -m "feat(tutorial): add help screen with game overview and tutorial reset"
```

---

### Task 7: Database Schema & API Route

**Files:**
- Modify: `src/server/schema.sql`
- Modify: `src/server/index.ts`
- Modify: `src/client/network/api.ts`

**Context:** Add tutorial columns to accounts table. Add PATCH /api/tutorial endpoint. Wire up the API client stub from Task 3.

**Step 1: Add columns to schema.sql**

Add to the `accounts` CREATE TABLE (before the closing `);`):
```sql
  tutorial_enabled INTEGER DEFAULT 1,
  tutorial_seen TEXT DEFAULT '[]'
```

**Step 2: Add PATCH /api/tutorial route to index.ts**

In the `handleApi` function, add after the match/complete route (around line 131):
```typescript
    // ===== Tutorial =====
    if (path === "/tutorial" && method === "PATCH") return handleUpdateTutorial(request, env);
```

Add the handler function:
```typescript
async function handleUpdateTutorial(request: Request, env: Env): Promise<Response> {
  const user = await authenticateUser(request, env);
  if (!user || user.type !== "account") return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { enabled?: boolean; seen?: string[] };
  const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : undefined;
  const seen = body.seen !== undefined ? JSON.stringify(body.seen) : undefined;

  if (enabled !== undefined && seen !== undefined) {
    await env.DB.prepare("UPDATE accounts SET tutorial_enabled = ?, tutorial_seen = ? WHERE id = ?")
      .bind(enabled, seen, user.id).run();
  } else if (enabled !== undefined) {
    await env.DB.prepare("UPDATE accounts SET tutorial_enabled = ? WHERE id = ?")
      .bind(enabled, user.id).run();
  } else if (seen !== undefined) {
    await env.DB.prepare("UPDATE accounts SET tutorial_seen = ? WHERE id = ?")
      .bind(seen, user.id).run();
  }

  return Response.json({ ok: true });
}
```

**Step 3: Add tutorial state to /api/auth/me response**

In `authenticateUser()` or `handleGetMe()`, add `tutorial_enabled` and `tutorial_seen` to the SELECT for account users, and include them in the response.

In the account query within `authenticateUser()`, add the fields:
```sql
SELECT id, username, ..., tutorial_enabled, tutorial_seen FROM accounts WHERE id = ?
```

Return them in the auth user object so the client can read them on login.

**Step 4: Implement api.ts saveTutorialState**

Replace the stub in `src/client/network/api.ts`:
```typescript
  async saveTutorialState(enabled: boolean, seen: string[]): Promise<void> {
    await this.fetch("/api/tutorial", {
      method: "PATCH",
      body: JSON.stringify({ enabled, seen }),
    });
  }
```

**Step 5: Add tutorial sync on login**

In game.ts, after a successful login/auth/me response that includes tutorial data, merge the server state:
```typescript
  // After receiving auth response with tutorialEnabled/tutorialSeen:
  if (authResponse.tutorial_enabled !== undefined) {
    const serverSeen = new Set<TutorialScreenId>(
      JSON.parse(authResponse.tutorial_seen || "[]")
    );
    // Merge: union of local and server seen screens
    for (const id of serverSeen) this.tutorialSeen.add(id);
    // Server disabled = keep disabled
    if (!authResponse.tutorial_enabled) this.tutorialEnabled = false;
    this.saveTutorialState();
  }
```

**Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add src/server/schema.sql src/server/index.ts src/client/network/api.ts src/client/game/game.ts
git commit -m "feat(tutorial): add DB persistence and API endpoint for tutorial state"
```

---

### Task 8: Settings Integration

**Files:**
- Modify: `src/client/game/game.ts`

**Context:** Add a tutorial toggle to the settings screen. Uses the existing mutator toggle pattern (clickable button).

**Step 1: Add tutorial toggle in drawSettings**

In `drawSettings()`, after the roulette toggle (around line ~4146), add:

```typescript
    // Tutorial toggle
    const tutorialHovered = this.isHovered("button-tutorial-toggle", mx, my);
    const tutorialColor = this.tutorialEnabled ? "#44ff88" : (tutorialHovered ? COLORS.ui : COLORS.uiDim);
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = tutorialColor;
    ctx.textAlign = "center";
    ctx.fillText(`[H] Tutorial: ${this.tutorialEnabled ? "AN" : "AUS"}`, w / 2, 530);
    this.menuClickRegions.push({ x: w / 2 - 80, y: 518, width: 160, height: 20, id: "button-tutorial-toggle" });
```

**Step 2: Add H key handler in settings**

In the settings keydown handler, add:
```typescript
      if (key === "h") {
        this.tutorialEnabled = !this.tutorialEnabled;
        this.saveTutorialState();
        if (this.api.isAccount) {
          this.api.saveTutorialState(this.tutorialEnabled, [...this.tutorialSeen]).catch(() => {});
        }
      }
```

**Step 3: Add click handler**

In the click handler for settings, add:
```typescript
    if (clickedId === "button-tutorial-toggle") {
      this.tutorialEnabled = !this.tutorialEnabled;
      this.saveTutorialState();
    }
```

**Step 4: Run typecheck and tests**

Run: `npx tsc --noEmit && npm test && npm run test:e2e`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client/game/game.ts
git commit -m "feat(tutorial): add tutorial toggle in settings screen"
```

---

### Task 9: E2E Tests

**Files:**
- Create: `e2e/tutorial.spec.ts`

**Context:** Test the tutorial system using Playwright. Use existing E2E patterns: `getTestState(page)`, `waitForScreen(page, "screenName")`, keyboard events.

**Step 1: Write E2E tests**

```typescript
import { test, expect } from "@playwright/test";
import { waitForGameReady, waitForScreen, getTestState } from "./helpers";

test.describe("Tutorial System", () => {
  test.beforeEach(async ({ page }) => {
    // Clear tutorial localStorage before each test
    await page.goto("http://localhost:4173");
    await page.evaluate(() => {
      localStorage.removeItem("tutorialEnabled");
      localStorage.removeItem("tutorialSeen");
    });
    await page.reload();
    await waitForGameReady(page);
  });

  test("H key opens help screen from menu", async ({ page }) => {
    await page.keyboard.press("h");
    await waitForScreen(page, "help");
  });

  test("Escape returns from help to menu", async ({ page }) => {
    await page.keyboard.press("h");
    await waitForScreen(page, "help");
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
  });

  test("tutorial banner shows on first profile visit", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    const state = await getTestState(page);
    expect(state.tutorialActive).toBe("profile");
  });

  test("Enter dismisses tutorial banner", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("Enter");
    // Re-check: tutorial should be gone
    const state = await getTestState(page);
    expect(state.tutorialActive).toBeNull();
  });

  test("tutorial does not show on second visit", async ({ page }) => {
    // First visit
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("Enter"); // Dismiss
    // Go back and return
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    const state = await getTestState(page);
    expect(state.tutorialActive).toBeNull();
  });

  test("T key disables all tutorials", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("t"); // Disable tutorial
    // Go to another screen — should not show tutorial
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter"); // game-config
    await waitForScreen(page, "game-config");
    const state = await getTestState(page);
    expect(state.tutorialActive).toBeNull();
  });

  test("tutorial overlay blocks input on game-config", async ({ page }) => {
    await page.keyboard.press("Enter"); // Go to game-config
    await waitForScreen(page, "game-config");
    const state = await getTestState(page);
    expect(state.tutorialActive).toBe("game-config");
  });

  test("R key in help screen resets tutorial", async ({ page }) => {
    // Dismiss a tutorial first
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    // Go to help, press R
    await page.keyboard.press("h");
    await waitForScreen(page, "help");
    await page.keyboard.press("r");
    // Go back and check profile shows tutorial again
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    const state = await getTestState(page);
    expect(state.tutorialActive).toBe("profile");
  });
});
```

**Step 2: Expose tutorialActive in _testState**

In game.ts, add `tutorialActive` to the `_testState` getter so Playwright can read it:
```typescript
  get _testState() {
    return {
      ...existingFields,
      tutorialActive: this.tutorialActive,
    };
  }
```

**Step 3: Run E2E tests**

Run: `npm run test:e2e`
Expected: All tests pass

**Step 4: Commit**

```bash
git add e2e/tutorial.spec.ts src/client/game/game.ts
git commit -m "test(tutorial): add E2E tests for tutorial system"
```

---

### Task 10: Smoke Test & Deploy

**Files:**
- Modify: `scripts/smoke-test.js`

**Context:** Add smoke test for the new PATCH /api/tutorial endpoint. Then deploy.

**Step 1: Add smoke test**

Add to the `tests` array in `scripts/smoke-test.js`:
```javascript
  {
    name: "Route: /api/tutorial requires auth",
    url: "/api/tutorial",
    method: "PATCH",
    body: { enabled: true, seen: [] },
    expect: (res) => res.status === 401,
  },
```

**Step 2: Run full test suite**

Run: `npx tsc --noEmit && npm test && npm run test:e2e`
Expected: ALL pass

**Step 3: Commit and deploy**

```bash
git add scripts/smoke-test.js
git commit -m "test(tutorial): add smoke test for tutorial API endpoint"
git push
```

The auto-deploy hook will trigger after push. Verify the smoke test passes after deployment.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Tutorial config + i18n translations | constants.ts, de.ts, en.ts |
| 2 | Config completeness tests | tutorial.test.ts |
| 3 | Tutorial state management (localStorage) | game.ts, api.ts |
| 4 | Banner rendering for simple screens | game.ts |
| 5 | Overlay rendering for complex screens | game.ts |
| 6 | Help screen (H key) | game.ts |
| 7 | DB schema + API route + sync | schema.sql, index.ts, api.ts, game.ts |
| 8 | Settings toggle | game.ts |
| 9 | E2E tests | tutorial.spec.ts, game.ts |
| 10 | Smoke test + deploy | smoke-test.js |
