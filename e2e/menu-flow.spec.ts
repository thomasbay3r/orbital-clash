import { test, expect } from "@playwright/test";
import { getTestState, waitForScreen, waitForGameReady } from "./helpers";

test.describe("Menu Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Disable tutorials so overlays don't block navigation
    await page.addInitScript(() => {
      localStorage.setItem("tutorialEnabled", "false");
    });
    await page.goto("/");
    await waitForGameReady(page);
  });

  test("starts on menu screen", async ({ page }) => {
    const state = await getTestState(page);
    expect(state.screen).toBe("menu");
  });

  test("shows ORBITAL CLASH title on canvas", async ({ page }) => {
    // Take a screenshot and verify the canvas renders (non-empty)
    const canvas = page.locator("canvas#gameCanvas");
    const screenshot = await canvas.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(1000);
  });

  test("Enter navigates to game-config", async ({ page }) => {
    await page.keyboard.press("Enter");
    await waitForScreen(page, "game-config");
  });

  test("keyboard 1-4 selects ships in game-config", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");

    await page.keyboard.press("2");
    let state = await getTestState(page);
    expect(state.selectedShip).toBe(1); // 0-indexed: key "2" → index 1 (Titan)

    await page.keyboard.press("4");
    state = await getTestState(page);
    expect(state.selectedShip).toBe(3); // Nova
  });

  test("Q/E cycles maps in game-config", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");

    const initial = (await getTestState(page)).selectedMap;
    expect(initial).toBe(0);

    await page.keyboard.press("e");
    let state = await getTestState(page);
    expect(state.selectedMap).toBe(1);

    await page.keyboard.press("e");
    state = await getTestState(page);
    expect(state.selectedMap).toBe(2);

    await page.keyboard.press("q");
    state = await getTestState(page);
    expect(state.selectedMap).toBe(1);
  });

  test("Z/C cycles modes in game-config", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");

    await page.keyboard.press("c");
    let state = await getTestState(page);
    expect(state.selectedMode).toBe(1);

    await page.keyboard.press("c");
    state = await getTestState(page);
    expect(state.selectedMode).toBe(2);

    await page.keyboard.press("z");
    state = await getTestState(page);
    expect(state.selectedMode).toBe(1);
  });

  test("game-config Enter navigates to mod-select", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");

    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
  });

  test("M from hub navigates to game-config with online flow", async ({ page }) => {
    await page.keyboard.press("m"); // hub → game-config (online flow)
    await waitForScreen(page, "game-config");
  });

  test("mod-select → Escape returns to game-config", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");

    await page.keyboard.press("Escape");
    await waitForScreen(page, "game-config");
  });

  test("mod-select → Enter goes to settings (local flow)", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");

    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
  });

  test("settings → Escape returns to mod-select", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");

    await page.keyboard.press("Escape");
    await waitForScreen(page, "mod-select");
  });

  test("settings difficulty selection via keyboard", async ({ page }) => {
    // Navigate to settings
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");

    // Default difficulty is index 2 (Kopfgeldjäger)
    let state = await getTestState(page);
    expect(state.selectedDifficulty).toBe(2);

    // Press "1" to select first difficulty
    await page.keyboard.press("1");
    state = await getTestState(page);
    expect(state.selectedDifficulty).toBe(0);

    // Arrow right to increase
    await page.keyboard.press("ArrowRight");
    state = await getTestState(page);
    expect(state.selectedDifficulty).toBe(1);

    // Press "5" to select hardest
    await page.keyboard.press("5");
    state = await getTestState(page);
    expect(state.selectedDifficulty).toBe(4);
  });

  test("settings bot count selection via keyboard", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");

    // Default bot count is 3
    let state = await getTestState(page);
    expect(state.selectedBotCount).toBe(3);

    // Arrow down decreases
    await page.keyboard.press("ArrowDown");
    state = await getTestState(page);
    expect(state.selectedBotCount).toBe(2);

    await page.keyboard.press("ArrowDown");
    state = await getTestState(page);
    expect(state.selectedBotCount).toBe(1);

    // Can't go below 1
    await page.keyboard.press("ArrowDown");
    state = await getTestState(page);
    expect(state.selectedBotCount).toBe(1);

    // Arrow up increases
    await page.keyboard.press("ArrowUp");
    state = await getTestState(page);
    expect(state.selectedBotCount).toBe(2);
  });

  test("Tab cycles control mode in mod-select", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");

    let state = await getTestState(page);
    expect(state.selectedControlMode).toBe(0); // absolute

    await page.keyboard.press("Tab");
    state = await getTestState(page);
    expect(state.selectedControlMode).toBe(1); // ship-relative

    await page.keyboard.press("Tab");
    state = await getTestState(page);
    expect(state.selectedControlMode).toBe(0); // wraps back
  });

  test("full local flow: hub → game-config → mod-select → settings → playing", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");

    // Select ship + enter
    await page.keyboard.press("3"); // Specter
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");

    // Continue to settings
    await page.keyboard.press("Enter");
    await waitForScreen(page, "settings");

    // Start game
    await page.keyboard.press("Enter");
    await waitForScreen(page, "playing");

    // Game state should exist
    const state = await getTestState(page);
    expect(state.gameState).not.toBeNull();
    expect(state.isOnline).toBe(false);
  });

  test("online flow: hub → game-config → mod-select → online-lobby", async ({ page }) => {
    await page.keyboard.press("m"); // hub → game-config (online flow)
    await waitForScreen(page, "game-config");

    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");

    await page.keyboard.press("Enter"); // mod-select → online-lobby
    await waitForScreen(page, "online-lobby");
  });

  test("online-lobby → Escape returns to mod-select", async ({ page }) => {
    await page.keyboard.press("m"); // hub → game-config (online flow)
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → online-lobby
    await waitForScreen(page, "online-lobby");

    await page.keyboard.press("Escape");
    await waitForScreen(page, "mod-select");
  });

  test("map cycling wraps around (E past last → first)", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    // 6 maps: 0..5 → wraps to 0
    for (let i = 0; i < 6; i++) await page.keyboard.press("e");
    const state = await getTestState(page);
    expect(state.selectedMap).toBe(0);
  });

  test("map cycling wraps around (Q past first → last)", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    // From 0, Q should wrap to 5
    await page.keyboard.press("q");
    const state = await getTestState(page);
    expect(state.selectedMap).toBe(5);
  });

  test("mode cycling wraps around (C past last → first)", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    // 8 modes: 0..7 → wraps to 0
    for (let i = 0; i < 8; i++) await page.keyboard.press("c");
    const state = await getTestState(page);
    expect(state.selectedMode).toBe(0);
  });

  test("mode cycling wraps around (Z past first → last)", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    // From 0, Z should wrap to 7
    await page.keyboard.press("z");
    const state = await getTestState(page);
    expect(state.selectedMode).toBe(7);
  });

  test("tutorial overlay is dismissable by mouse click", async ({ page }) => {
    // Re-enable tutorial via localStorage then reload so loadTutorialState() picks it up.
    // Use addInitScript to override the beforeEach script for this reload.
    await page.addInitScript(() => {
      localStorage.setItem("tutorialEnabled", "true");
      localStorage.setItem("tutorialSeen", JSON.stringify([]));
    });
    await page.reload();
    await waitForGameReady(page);
    // Navigate to game-config where tutorial overlay shows
    await page.keyboard.press("Enter");
    await waitForScreen(page, "game-config");
    // Wait a frame for render loop to populate tutorialActive
    await page.waitForTimeout(100);
    // Tutorial overlay should be active
    const beforeClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
    expect(beforeClick).toBe("game-config");
    // Click anywhere on the canvas
    await page.mouse.click(640, 400);
    // Wait a frame for dismissal to register
    await page.waitForTimeout(100);
    // Tutorial should be dismissed
    const afterClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
    expect(afterClick).toBeNull();
  });

  test("tutorial banner is dismissable by clicking on it", async ({ page }) => {
    // Re-enable tutorial via localStorage then reload so loadTutorialState() picks it up.
    // Use addInitScript to override the beforeEach script for this reload.
    await page.addInitScript(() => {
      localStorage.setItem("tutorialEnabled", "true");
      localStorage.setItem("tutorialSeen", JSON.stringify([]));
    });
    await page.reload();
    await waitForGameReady(page);
    // Navigate to profile where banner shows
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    // Wait a frame for render loop to populate tutorialActive
    await page.waitForTimeout(100);
    const beforeClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
    expect(beforeClick).toBe("profile");
    // Click in the banner area (top 44px)
    await page.mouse.click(640, 20);
    // Wait a frame for dismissal to register
    await page.waitForTimeout(100);
    const afterClick = await page.evaluate(() => (window as any).__game._testState.tutorialActive);
    expect(afterClick).toBeNull();
  });

  test("help screen back button is clickable", async ({ page }) => {
    await waitForGameReady(page);
    await waitForScreen(page, "menu");
    // Navigate to help screen via H key
    await page.keyboard.press("h");
    await waitForScreen(page, "help");
    // Wait a frame for click regions to be populated
    await page.waitForTimeout(100);
    // Find the back button click region and click its center
    const region = await page.evaluate(() => {
      const g = (window as any).__game;
      return g.menuClickRegions.find((r: any) => r.id === "button-help-back");
    });
    expect(region).not.toBeNull();
    await page.mouse.click(region.x + region.width / 2, region.y + region.height / 2);
    await waitForScreen(page, "menu");
  });

  test("help screen accessible via mouse click from main menu", async ({ page }) => {
    await waitForGameReady(page);
    await waitForScreen(page, "menu");
    // Wait a frame for the hub render loop to populate click regions
    await page.waitForTimeout(100);
    // Find the help button in the renderer's click regions
    const helpBtnPos = await page.evaluate(() => {
      const r = (window as any).__game?.renderer;
      if (!r) return null;
      const regions: any[] = r.getClickRegions ? r.getClickRegions() : (r.clickRegions ?? []);
      return regions.find((reg: any) => reg.id === "button-help") ?? null;
    });
    // Before implementation: helpBtnPos will be null — test fails here
    expect(helpBtnPos).not.toBeNull();
    await page.mouse.click(helpBtnPos!.x + helpBtnPos!.width / 2, helpBtnPos!.y + helpBtnPos!.height / 2);
    await waitForScreen(page, "help");
  });

  test("help screen tutorial reset button is clickable", async ({ page }) => {
    await waitForGameReady(page);
    await waitForScreen(page, "menu");
    await page.keyboard.press("h");
    await waitForScreen(page, "help");
    // Wait a frame for click regions to be populated
    await page.waitForTimeout(100);
    // Find the reset button click region and click its center
    const region = await page.evaluate(() => {
      const g = (window as any).__game;
      return g.menuClickRegions.find((r: any) => r.id === "button-help-reset");
    });
    expect(region).not.toBeNull();
    await page.mouse.click(region.x + region.width / 2, region.y + region.height / 2);
    // tutorialResetFeedback should be set to a positive value
    await page.waitForTimeout(100);
    const feedback = await page.evaluate(() => (window as any).__game._testState.tutorialResetFeedback);
    expect(feedback).toBeGreaterThan(0);
  });
});
