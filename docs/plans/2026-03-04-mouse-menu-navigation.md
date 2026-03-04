# Mouse Menu Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all pre-game menu actions reachable with mouse clicks (no keyboard required).

**Architecture:** Three targeted changes to `src/client/game/game.ts` and one to `src/client/rendering/renderer.ts`. Tutorial click-dismiss is added at the start of `handleMenuClick()`. The help screen replaces text hints with `drawMenuButton()` calls and gets a new click handler. The help button is added to `renderer.drawHub()`.

**Tech Stack:** TypeScript, HTML5 Canvas, Vitest (unit tests), Playwright E2E (port 4173)

---

## Context & Key Files

- `src/client/game/game.ts` — main game state machine
  - `handleMenuClick(mx, my)` (line ~991) — click dispatcher
  - `drawMenuOverlay()` (line ~2493) — overlay drawn over menu hub
  - `drawHelp()` (line ~3739) — help screen rendering
  - `drawTutorialOverlay()` (line ~3374) — fullscreen tutorial block
  - `drawTutorialBanner()` (line ~3355) — top-of-screen tutorial hint
  - `_testState` getter (line ~265) — exposes: `screen`, `tutorialActive`, `tutorialEnabled`, `tutorialSeen`, `tutorialResetFeedback`
- `src/client/rendering/renderer.ts` — `drawHub()` (line ~1023) draws main menu buttons
- `e2e/menu-flow.spec.ts` — existing E2E tests to extend
- `e2e/helpers.ts` — `waitForScreen(page, name)`, `waitForGameReady(page)`

**Patterns:**
- `this.drawMenuButton(ctx, cx, cy, bw, bh, label, color, id, mx, my)` auto-registers click regions in `this.menuClickRegions[]`
- `this.hitTestLocal(mx, my)` checks `this.menuClickRegions`
- Tutorial state: `tutorialActive: TutorialScreenId | null` — null means no tutorial showing
- Tutorial types: `"overlay"` (fullscreen, blocks keys) or `"banner"` (44px top strip)
- Tutorial dismiss: `this.markTutorialSeen(id)` or `this.disableTutorial()`
- `TUTORIAL_SCREENS` from `src/shared/constants.ts` has `{ id, type }` for each screen

---

## Task 1: Tutorial click-dismiss — failing E2E test

**Files:**
- Modify: `e2e/menu-flow.spec.ts`

**Step 1: Add failing E2E test**

Add at the end of `e2e/menu-flow.spec.ts`:

```typescript
test("tutorial overlay is dismissable by mouse click", async ({ page }) => {
  await waitForGameReady(page);
  // Force tutorial to show on game-config by resetting state via _testState helpers
  await page.evaluate(() => {
    const game = (window as any).__game;
    game._testState._tutorialHelpers.markSeen; // just access to verify exists
    game.tutorialEnabled = true;
    game.tutorialSeen = new Set();
  });
  // Navigate to game-config where tutorial overlay shows
  await page.keyboard.press("Enter");
  await waitForScreen(page, "game-config");
  // Tutorial overlay should be active
  const beforeClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
  expect(beforeClick).toBe("game-config");
  // Click anywhere on the canvas
  await page.mouse.click(640, 400);
  // Tutorial should be dismissed
  const afterClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
  expect(afterClick).toBeNull();
});

test("tutorial banner is dismissable by clicking on it", async ({ page }) => {
  await waitForGameReady(page);
  await page.evaluate(() => {
    const game = (window as any).__game;
    game.tutorialEnabled = true;
    game.tutorialSeen = new Set();
  });
  // Navigate to profile where banner shows
  await page.keyboard.press("KeyP");
  await waitForScreen(page, "profile");
  const beforeClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
  expect(beforeClick).toBe("profile");
  // Click in the banner area (top 44px)
  await page.mouse.click(640, 20);
  const afterClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
  expect(afterClick).toBeNull();
});
```

**Step 2: Run test to verify it fails**

```bash
npm run test:e2e -- --grep "tutorial.*mouse\|tutorial.*click\|tutorial.*banner"
```

Expected: FAIL — clicking does nothing yet.

---

## Task 2: Implement tutorial click-dismiss

**Files:**
- Modify: `src/client/game/game.ts`

**Step 1: Add tutorial check at start of handleMenuClick**

Find the beginning of `handleMenuClick()` (line ~991). After the `audioInitialized` block, before the `if (this.screen === "menu")` check, insert:

```typescript
// Tutorial click-dismiss: overlay = any click dismisses; banner = click in top 44px dismisses
if (this.tutorialActive) {
  const config = TUTORIAL_SCREENS.find((s) => s.id === this.tutorialActive);
  if (config?.type === "overlay") {
    this.markTutorialSeen(this.tutorialActive);
    return;
  }
  if (config?.type === "banner" && my < 44) {
    this.markTutorialSeen(this.tutorialActive);
    return;
  }
}
```

**Step 2: Run tutorial tests**

```bash
npm run test:e2e -- --grep "tutorial.*mouse\|tutorial.*click\|tutorial.*banner"
```

Expected: PASS

**Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors

**Step 4: Commit**

```bash
git add src/client/game/game.ts e2e/menu-flow.spec.ts
git commit -m "feat: make tutorial overlays and banners dismissable by mouse click"
```

---

## Task 3: Help screen — failing E2E tests

**Files:**
- Modify: `e2e/menu-flow.spec.ts`

**Step 1: Add failing tests**

```typescript
test("help screen back button is clickable", async ({ page }) => {
  await waitForGameReady(page);
  // Navigate to help screen via keyboard (H key — this still works)
  await page.keyboard.press("KeyH");
  await waitForScreen(page, "help");
  // Click the back button — currently only text hint, not a real button
  // The button will be at bottom of screen; use mouse.click on a coordinate
  // After implementation, this should work
  const w = await page.evaluate(() => window.innerWidth);
  const h = await page.evaluate(() => window.innerHeight);
  // Back button will be at roughly w/2, bottom area — click it
  await page.mouse.click(w / 2, h - 60);
  await waitForScreen(page, "menu");
});

test("help screen tutorial reset button is clickable", async ({ page }) => {
  await waitForGameReady(page);
  await page.evaluate(() => {
    const game = (window as any).__game;
    game.tutorialEnabled = true;
    game.tutorialSeen = new Set(["game-config", "mod-select"]);
  });
  await page.keyboard.press("KeyH");
  await waitForScreen(page, "help");
  // Click the reset button
  const w = await page.evaluate(() => window.innerWidth);
  const h = await page.evaluate(() => window.innerHeight);
  await page.mouse.click(w / 2, h - 110);
  // tutorialResetFeedback should be set
  const feedback = await page.evaluate(() => (window as any).__game._testState.tutorialResetFeedback);
  expect(feedback).toBeGreaterThan(0);
});
```

**Step 2: Run to verify they fail**

```bash
npm run test:e2e -- --grep "help screen"
```

Expected: FAIL — no click regions on help screen yet.

---

## Task 4: Implement help screen clickable buttons

**Files:**
- Modify: `src/client/game/game.ts`

### 4a: Convert drawHelp() text hints to buttons

Find `drawHelp()` (line ~3739). In the method, add `const mx = this.input.getMouseX(); const my = this.input.getMouseY();` near the top (after `this.menuClickRegions = [];`), then find the tutorial reset text block and back hint:

**Find and replace the tutorial reset text (currently ~line 3813):**

```typescript
// BEFORE:
ctx.textAlign = "center";
ctx.font = "bold 14px monospace";
ctx.fillStyle = this.tutorialResetFeedback > 0 ? "#44ff88" : COLORS.uiDim;
ctx.fillText(
  this.tutorialResetFeedback > 0 ? t("help.tutorialReset") : t("help.resetTutorial"),
  w / 2, y,
);
y += 40;

// Back hint
ctx.font = "13px monospace";
ctx.fillStyle = COLORS.uiDim;
ctx.fillText("[Escape] " + t("help.back"), w / 2, y);
```

**Replace with:**

```typescript
// Tutorial reset button
const resetColor = this.tutorialResetFeedback > 0 ? "#44ff88" : COLORS.uiDim;
const resetLabel = this.tutorialResetFeedback > 0 ? t("help.tutorialReset") : t("help.resetTutorial");
this.drawMenuButton(ctx, w / 2, y, 280, 36, resetLabel, resetColor, "button-help-reset", mx, my);
y += 55;

// Back button
this.drawMenuButton(ctx, w / 2, y, 180, 36, t("help.back"), COLORS.uiDim, "button-help-back", mx, my);
```

### 4b: Add handleMenuClick case for "help" screen

Find `handleMenuClick()`. Add a new `else if` case. A good place is after the `matchmaking` case. Add:

```typescript
} else if (this.screen === "help") {
  const hit = this.hitTestLocal(mx, my);
  if (!hit) return;
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

**Step: Run help screen tests**

```bash
npm run test:e2e -- --grep "help screen"
```

Expected: PASS (you may need to adjust y-coordinates in the test to match actual button positions — check by running and seeing where it fails).

**Note on test coordinates:** If button positions don't match, update the tests to use `page.evaluate` to get coordinates, or click with a wider search range. The button positions depend on how much content is above them. Alternatively, use a less brittle approach:

```typescript
// More robust: just click multiple positions until one hits
await page.mouse.click(w / 2, h - 60);
// If that fails, try h - 110 for the back button
```

**Step: Typecheck**

```bash
npx tsc --noEmit
```

**Step: Commit**

```bash
git add src/client/game/game.ts e2e/menu-flow.spec.ts
git commit -m "feat: add clickable buttons to help screen"
```

---

## Task 5: Help button in main menu — failing E2E test

**Files:**
- Modify: `e2e/menu-flow.spec.ts`

**Step 1: Add failing test**

```typescript
test("help screen accessible via mouse click from main menu", async ({ page }) => {
  await waitForGameReady(page);
  await waitForScreen(page, "menu");
  // Click the help button — doesn't exist yet
  // After implementation it will be in drawHub()
  const w = await page.evaluate(() => window.innerWidth);
  const h = await page.evaluate(() => window.innerHeight);
  // Help button will be below existing menu buttons — click bottom area
  // Exact coordinates depend on implementation; update after seeing rendered position
  await page.mouse.click(w / 2, h / 2 + 200);
  await waitForScreen(page, "help");
  // Navigate back via click
  await page.mouse.click(w / 2, h - 60);
  await waitForScreen(page, "menu");
});
```

**Step 2: Run to verify it fails**

```bash
npm run test:e2e -- --grep "help screen accessible via mouse"
```

Expected: FAIL — no Help button in menu yet.

---

## Task 6: Add Help button to renderer.drawHub()

**Files:**
- Modify: `src/client/rendering/renderer.ts`

**Step 1: Find drawHub() in renderer.ts (line ~1023)**

At the end of the button list, after the last `this.drawButton(...)` call (currently after `button-friends` line), add:

```typescript
// Help button — small, below main buttons
this.drawButton(
  ctx,
  w / 2,
  btnY + 300,
  100,
  30,
  t("help.title"),
  COLORS.uiDim,
  "button-help",
  hoveredId,
);
```

**Step 2: Add click handler in game.ts handleMenuClick for "menu" screen**

Find the `if (this.screen === "menu")` block in `handleMenuClick()`. At the end of that block (before the closing brace), add:

```typescript
if (hit === "button-help") this.screen = "help";
```

**Step 3: Adjust test coordinates if needed**

Run the test to see if coordinates match. If the button renders at a different position, update the test's `page.mouse.click(w / 2, h / 2 + 200)` to the correct y-coordinate.

To find the exact position: temporarily add `console.log` in drawHub or use Playwright's `page.screenshot()`.

**Step 4: Run help button test**

```bash
npm run test:e2e -- --grep "help screen accessible via mouse"
```

Expected: PASS

**Step 5: Typecheck**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add src/client/rendering/renderer.ts src/client/game/game.ts e2e/menu-flow.spec.ts
git commit -m "feat: add Help button to main menu for mouse navigation"
```

---

## Task 7: Full test suite verification

**Step 1: Run all tests**

```bash
npx tsc --noEmit && npm test && npm run test:e2e
```

Expected: All pass.

**Step 2: If any E2E test fails due to coordinate mismatch**

For robust coordinate detection in E2E tests, use this pattern instead of hardcoded offsets:

```typescript
// More robust: check screen state after click rather than relying on coordinates
const state = await page.evaluate(() => (window as any).__game._testState);
expect(state.screen).toBe("help");
```

If the button click doesn't register, use Playwright's screenshot to see where the button renders:

```typescript
await page.screenshot({ path: "debug-screenshot.png" });
```

Then adjust coordinates.

**Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "test: fix E2E test coordinates for mouse navigation tests"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/client/game/game.ts` | Add tutorial click-dismiss block at start of `handleMenuClick()` |
| `src/client/game/game.ts` | Replace text hints in `drawHelp()` with `drawMenuButton()` calls |
| `src/client/game/game.ts` | Add `"help"` case to `handleMenuClick()` |
| `src/client/game/game.ts` | Add `button-help` handler in menu case of `handleMenuClick()` |
| `src/client/rendering/renderer.ts` | Add Help button to `drawHub()` |
| `e2e/menu-flow.spec.ts` | Add 5 new E2E tests for mouse navigation |

**Not changed:** All other screens (challenges, cosmetics, profile, friends, online-lobby, party-lobby) already have functional back buttons and click handlers — confirmed by code analysis.
