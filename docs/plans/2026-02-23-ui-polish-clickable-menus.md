# UI-Polish: Schriftgrößen + Vollständige Maus-Navigation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Alle Schriftgrößen auf lesbares Minimum anheben (12px min) und jede Tastatur-Aktion auch per Mausklick auslösen können.

**Architecture:** Bestehende `drawMenuButton()` in game.ts wird für alle Screens wiederverwendet. Jeder Hint-Text wie `[C] Herausforderungen` wird zu einem klickbaren Button. Die `handleMenuClick()`-Methode bekommt Branches für jeden Screen.

**Tech Stack:** TypeScript + HTML5 Canvas (Vite)

---

## Übersicht der Aufgaben

| Task | Screen(s) | Aufwand |
|------|-----------|---------|
| 1 | Globale Schriftgrößen-Fixes | Klein |
| 2 | Profil-Screen klickbar | Klein |
| 3 | Post-Game-Screen klickbar | Klein |
| 4 | Login-Screen klickbar | Mittel |
| 5 | Register-Screen klickbar | Klein |
| 6 | Freunde-Screen klickbar | Mittel |
| 7 | Challenges-Screen klickbar | Klein |
| 8 | Cosmetics-Screen klickbar | Mittel |
| 9 | Matchmaking-Screen klickbar | Klein |
| 10 | Menü-Overlay Quick-Play/Freunde klickbar | Klein |
| 11 | Login-Eingabefelder klickbar | Klein |
| 12 | Tests + Typecheck + Deploy | Klein |

---

### Task 1: Globale Schriftgrößen-Fixes

**Files:**
- Modify: `src/client/rendering/renderer.ts`
- Modify: `src/client/game/game.ts`

**Step 1: Fix renderer.ts Schriftgrößen**

Alle 9px/10px/11px Stellen in `renderer.ts` auf mindestens 12px anheben.

Änderungen in `renderer.ts`:
- Zeile ~616: Player nametags `10px` → `12px`
- Zeile ~788: Mutators HUD `10px` → `12px`
- Zeile ~865: Room code `11px` → `12px`
- Zeile ~1079: Ship stats in menu `10px` → `11px` (sehr kurze Texte, 11px OK in kleinen Boxen)
- Zeile ~1117: Map names `11px` → `12px`
- Zeile ~1153: Mode names `11px` → `12px`
- Zeile ~1173: Controls hints `12px` → bleiben

**Step 2: Fix game.ts Schriftgrößen**

Alle 9px/10px/11px Stellen in `game.ts` auf mindestens 12px anheben:

- Challenge-Beschreibungen `11px` → `12px` (Zeilen ~2007, ~2057)
- Challenge-Fortschritt `10px` → `12px` (Zeilen ~2023, ~2071)
- Achievement-Beschreibungen `10px` → `12px` (Zeile ~2113)
- Cosmetics Item-Name `11px` → `12px` (Zeile ~2225)
- Cosmetics Detail `9px` → `11px` (Zeile ~2232)
- Cosmetics Unlock `9px` → `11px` (Zeilen ~2239, ~2243)
- Control-Mode-Beschreibungen `9px` → `11px` (Zeile ~2334)
- Schwierigkeits-Namen `11px` → `12px` (Zeile ~2390)
- Schwierigkeits-Beschreibungen `9px` → `11px` (Zeile ~2394)
- Mutator-Labels `10px` → `12px` (Zeile ~2489)
- Mod-Beschreibungen `9px` → `11px` (Zeile ~2601)
- Freunde-Level `11px` → `12px` (Zeile ~1732)
- Menu-Overlay Hints `11px` → `12px` (Zeile ~1607)
- Emote-Nummern `12px` → bleiben

**Step 3: Run Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (nur Schriftgrößen-Strings geändert)

**Step 4: Commit**

```bash
git add src/client/rendering/renderer.ts src/client/game/game.ts
git commit -m "fix: increase minimum font sizes to 12px across all screens"
```

---

### Task 2: Profil-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Buttons in drawProfile() hinzufügen**

In `drawProfile()` (Zeile ~1855), die Hint-Texte `[C] Herausforderungen | [K] Cosmetics | [Esc] Zurueck` durch echte `drawMenuButton()`-Aufrufe ersetzen:

```typescript
// Ersetze die alten ctx.fillText hints durch Buttons:
this.menuClickRegions = [];  // Am Anfang der Methode

// Statt "[C] Herausforderungen | [K] Cosmetics | [Esc] Zurueck" Text:
const btnY = ctx.canvas.height - 60;
this.drawMenuButton(ctx, w / 2 - 200, btnY, 180, 36, "Herausforderungen", COLORS.ui, "btn-challenges", mx, my);
this.drawMenuButton(ctx, w / 2, btnY, 140, 36, "Cosmetics", COLORS.ui, "btn-cosmetics", mx, my);
this.drawMenuButton(ctx, w / 2 + 180, btnY, 120, 36, "Zurueck", COLORS.uiDim, "btn-profile-back", mx, my);
// Wenn Account eingeloggt:
if (this.api.isAccount) {
  this.drawMenuButton(ctx, w / 2, btnY + 45, 140, 32, "Abmelden", COLORS.gravityWell, "btn-logout", mx, my);
}
```

Maus-Position (`mx`, `my`) oben in der Methode holen:
```typescript
const mx = this.input.getMouseX();
const my = this.input.getMouseY();
```

**Step 2: Click-Handler in handleMenuClick() erweitern**

In `handleMenuClick()` nach dem `online-lobby`-Block einen neuen Block für `profile` einfügen:

```typescript
} else if (this.screen === "profile") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-challenges") this.screen = "challenges";
  if (hit === "btn-cosmetics") {
    this.cosmeticsCategory = 0;
    this.screen = "cosmetics";
  }
  if (hit === "btn-profile-back") this.screen = "menu";
  if (hit === "btn-logout") {
    this.api.logout();
    this.currentUser = null;
    this.screen = "menu";
  }
}
```

**Step 3: Run Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/client/game/game.ts
git commit -m "feat: make profile screen fully mouse-navigable"
```

---

### Task 3: Post-Game-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Buttons in drawPostGame() hinzufügen**

In `drawPostGame()` (Zeile ~1621), den Hint-Text `[Enter/N] Nochmal! [Esc/M] Hauptmenue` durch Buttons ersetzen:

```typescript
this.menuClickRegions = [];  // Am Anfang
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

// Statt dem alten Hint-Text:
const btnY = ctx.canvas.height - 60;
this.drawMenuButton(ctx, w / 2 - 120, btnY, 180, 44, "Nochmal!", COLORS.ui, "btn-play-again", mx, my);
this.drawMenuButton(ctx, w / 2 + 120, btnY, 180, 44, "Hauptmenue", COLORS.uiDim, "btn-to-menu", mx, my);
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "post-game") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-play-again") {
    if (this.isOnline) {
      this.screen = "playing";
      // Server-seitig Neustart triggern
    } else {
      this.startLocalGame();
    }
  }
  if (hit === "btn-to-menu") this.returnToMenu();
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make post-game screen fully mouse-navigable"
```

---

### Task 4: Login-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Buttons in drawLogin() hinzufügen**

In `drawLogin()` (Zeile ~1786), Hint-Text `[Enter] Anmelden | [R] Registrieren | [Esc] Zurueck` durch Buttons ersetzen:

```typescript
this.menuClickRegions = [];
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

// Drei Buttons am unteren Rand statt Hint-Text:
const btnY = 370;
this.drawMenuButton(ctx, w / 2 - 180, btnY, 160, 40, "Anmelden", COLORS.ui, "btn-do-login", mx, my);
this.drawMenuButton(ctx, w / 2, btnY, 160, 40, "Registrieren", COLORS.nova, "btn-to-register", mx, my);
this.drawMenuButton(ctx, w / 2 + 180, btnY, 120, 36, "Zurueck", COLORS.uiDim, "btn-login-back", mx, my);
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "login") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-do-login") this.doLogin();
  if (hit === "btn-to-register") {
    this.textInputFields = { email: "", username: "", password: "", password2: "" };
    this.textInputActive = "email";
    this.textInputError = "";
    this.screen = "register";
  }
  if (hit === "btn-login-back") this.screen = "menu";
  // Eingabefelder — siehe Task 11
  if (hit === "field-email") this.textInputActive = "email";
  if (hit === "field-password") this.textInputActive = "password";
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make login screen fully mouse-navigable"
```

---

### Task 5: Register-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Buttons in drawRegister() hinzufügen**

In `drawRegister()` (Zeile ~1820), Hint-Text ersetzen:

```typescript
this.menuClickRegions = [];
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

const btnY = 430;
this.drawMenuButton(ctx, w / 2 - 120, btnY, 180, 40, "Registrieren", COLORS.ui, "btn-do-register", mx, my);
this.drawMenuButton(ctx, w / 2 + 120, btnY, 120, 36, "Zurueck", COLORS.uiDim, "btn-register-back", mx, my);
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "register") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-do-register") this.doRegister();
  if (hit === "btn-register-back") this.screen = "login";
  if (hit === "field-email") this.textInputActive = "email";
  if (hit === "field-username") this.textInputActive = "username";
  if (hit === "field-password") this.textInputActive = "password";
  if (hit === "field-password2") this.textInputActive = "password2";
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make register screen fully mouse-navigable"
```

---

### Task 6: Freunde-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Buttons in drawFriends() hinzufügen**

In `drawFriends()` (Zeile ~1688), Hint-Text `S = Suchen | A = Anfragen | Esc = Zurueck` durch Buttons ersetzen:

```typescript
this.menuClickRegions = [];
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

// Navigation-Buttons am unteren Rand:
const navY = ctx.canvas.height - 50;
this.drawMenuButton(ctx, w / 2 - 180, navY, 140, 36, "Suchen", COLORS.ui, "btn-friends-search", mx, my);
this.drawMenuButton(ctx, w / 2, navY, 140, 36, "Anfragen", COLORS.nova, "btn-friends-requests", mx, my);
this.drawMenuButton(ctx, w / 2 + 180, navY, 120, 36, "Zurueck", COLORS.uiDim, "btn-friends-back", mx, my);
```

Zusätzlich: Jeden Freund in der Liste als klickbare Region registrieren (für "Beitreten"):
```typescript
// Innerhalb der Freunde-Schleife:
if (friend.status === "in-game" && friend.roomId) {
  this.menuClickRegions.push({
    x: w / 2 + 100, y: friendY - 12, width: 80, height: 24,
    id: `btn-join-friend-${i}`
  });
}
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "friends") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-friends-search") {
    this.friendSearchMode = !this.friendSearchMode;
    this.friendSearchInput = "";
  }
  if (hit === "btn-friends-requests") {
    this.friendRequestsMode = !this.friendRequestsMode;
  }
  if (hit === "btn-friends-back") this.screen = "menu";
  if (hit.startsWith("btn-join-friend-")) {
    const idx = parseInt(hit.split("-")[3]);
    const friend = this.friendsList[idx];
    if (friend?.roomId) this.joinRoom(friend.roomId);
  }
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make friends screen fully mouse-navigable"
```

---

### Task 7: Challenges-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Zurück-Button in drawChallenges() hinzufügen**

In `drawChallenges()` (Zeile ~1971), Hint `[Esc] Zurueck zum Profil` durch Button ersetzen:

```typescript
this.menuClickRegions = [];
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

// Zurück-Button unten:
this.drawMenuButton(ctx, w / 2, ctx.canvas.height - 50, 200, 36, "Zurueck zum Profil", COLORS.uiDim, "btn-challenges-back", mx, my);
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "challenges") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-challenges-back") this.screen = "profile";
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make challenges screen fully mouse-navigable"
```

---

### Task 8: Cosmetics-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Kategorie-Tabs und Zurück-Button klickbar machen**

In `drawCosmetics()` (Zeile ~2129), Tab-Labels `[1] Skins [2] Trails [3] Effekte [4] Titel` als klickbare Buttons:

```typescript
this.menuClickRegions = [];
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

// Tabs als klickbare Buttons statt "[1] Skins" Text:
const tabNames = ["Skins", "Trails", "Effekte", "Titel"];
const tabY = 100;
const tabWidth = 120;
for (let i = 0; i < tabNames.length; i++) {
  const tabX = w / 2 - 240 + i * 160;
  const isActive = this.cosmeticsCategory === i;
  const color = isActive ? COLORS.ui : COLORS.uiDim;
  this.drawMenuButton(ctx, tabX, tabY, tabWidth, 32, tabNames[i], color, `btn-cosmetics-tab-${i}`, mx, my);
}

// Zurück-Button unten:
this.drawMenuButton(ctx, w / 2, ctx.canvas.height - 50, 120, 36, "Zurueck", COLORS.uiDim, "btn-cosmetics-back", mx, my);
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "cosmetics") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit.startsWith("btn-cosmetics-tab-")) {
    this.cosmeticsCategory = parseInt(hit.split("-")[3]);
  }
  if (hit === "btn-cosmetics-back") this.screen = "profile";
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make cosmetics screen fully mouse-navigable"
```

---

### Task 9: Matchmaking-Screen klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Abbrechen-Button in drawMatchmaking() hinzufügen**

In der Matchmaking-Zeichenmethode (Zeile ~1908), `[Esc] Abbrechen` durch Button ersetzen:

```typescript
this.menuClickRegions = [];
const mx = this.input.getMouseX();
const my = this.input.getMouseY();

this.drawMenuButton(ctx, w / 2, ctx.canvas.height - 80, 160, 40, "Abbrechen", COLORS.gravityWell, "btn-matchmaking-cancel", mx, my);
```

**Step 2: Click-Handler erweitern**

```typescript
} else if (this.screen === "matchmaking") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
  if (hit === "btn-matchmaking-cancel") {
    this.api.leaveQueue();
    this.screen = "menu";
  }
}
```

**Step 3: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make matchmaking screen fully mouse-navigable"
```

---

### Task 10: Menü-Overlay Quick-Play/Freunde klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`
- Modify: `src/client/rendering/renderer.ts`

**Step 1: Buttons im Menü-Overlay für Quick-Play und Freunde**

In `drawMenuOverlay()` (Zeile ~1583), den Hint-Text `Space = Quick Play | F = Freunde | P = Profil` durch klickbare Buttons ersetzen. Da das Menü den `renderer.hitTest()` verwendet (nicht `hitTestLocal`), müssen diese Buttons entweder:
- In den Renderer verschoben werden (neben Weiter/Multiplayer/Anmelden), oder
- Als Overlay-Buttons via `menuClickRegions` registriert werden

Einfachste Lösung: Buttons im Renderer unter dem "Anmelden"-Button hinzufügen.

In `renderer.ts`, in `drawMenu()` nach dem `button-account`:

```typescript
// Quick Play + Freunde Buttons
this.drawButton(ctx, w / 2 - 110, 755, 180, 28, "Quick Play", COLORS.uiDim, "button-quickplay", hoveredId);
this.drawButton(ctx, w / 2 + 110, 755, 140, 28, "Freunde", COLORS.uiDim, "button-friends", hoveredId);
```

In `game.ts`, in der `handleMenuClick` → `"menu"` Sektion:

```typescript
if (hit === "button-quickplay") this.startQuickPlay();
if (hit === "button-friends") {
  if (this.api.isAccount) {
    this.loadFriends();
    this.screen = "friends";
  } else {
    this.textInputError = "Freunde nur mit Konto verfuegbar";
  }
}
```

Den alten Hint-Text `Space = Quick Play | F = Freunde | P = Profil` in `drawMenuOverlay()` entfernen (der "P = Profil" ist bereits durch den "Anmelden/Profil"-Button abgedeckt).

**Step 2: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts src/client/rendering/renderer.ts
git commit -m "feat: add Quick Play and Friends buttons to main menu"
```

---

### Task 11: Login/Register-Eingabefelder klickbar machen

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: drawInputField() erweitern — Click-Region registrieren**

In `drawInputField()` (Zeile ~1935), am Ende der Methode die klickbare Region registrieren:

```typescript
// Am Ende von drawInputField():
this.menuClickRegions.push({
  x: cx - 150, y: y - 15, width: 300, height: 30,
  id: `field-${fieldName}`
});
```

Die Click-Handler für `field-email`, `field-password` etc. wurden bereits in Tasks 4 und 5 hinzugefügt.

**Step 2: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/client/game/game.ts
git commit -m "feat: make login/register input fields clickable"
```

---

### Task 12: Tests + Typecheck + Deploy

**Files:**
- Test: `e2e/social-screens.spec.ts` (bestehende Tests müssen weiterhin bestehen)

**Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 2: Unit-Tests**

Run: `npm test`
Expected: 277 Tests bestehen

**Step 3: E2E-Tests**

Run: `npm run test:e2e`
Expected: 57 Tests bestehen (bestehende Social-Screen-Navigation sollte weiterhin funktionieren, da Tastatur-Shortcuts beibehalten werden)

**Step 4: Build + Deploy**

Run: `npm run deploy`
Expected: Successful deploy mit neuen Assets

**Step 5: Visueller Check**

Deployed Site aufrufen und mit Playwright verifizieren:
- Menü: "Quick Play" und "Freunde" Buttons sichtbar
- Profil: "Herausforderungen", "Cosmetics", "Zurueck" Buttons sichtbar
- Login/Register: "Anmelden", "Registrieren", "Zurueck" Buttons sichtbar
- Post-Game: "Nochmal!" und "Hauptmenue" Buttons sichtbar
- Alle Schriftgrößen >= 11px (beschreibende Subtexte) bzw >= 12px (interaktive/informative Texte)

**Step 6: Final Commit**

```bash
git add -A
git commit -m "feat: complete UI polish — clickable menus + readable font sizes"
```
