import { test, expect } from "@playwright/test";
import { getTestState, waitForScreen, waitForGameReady } from "./helpers";

/** Navigate from menu through to playing screen */
async function startLocalGame(page: import("@playwright/test").Page) {
  await page.keyboard.press("Enter"); // menu → mod-select
  await waitForScreen(page, "mod-select");
  await page.keyboard.press("Enter"); // mod-select → settings
  await waitForScreen(page, "settings");
  await page.keyboard.press("Enter"); // settings → playing
  await waitForScreen(page, "playing");
}

test.describe("Gameplay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);
  });

  test("local game creates game state with players", async ({ page }) => {
    await startLocalGame(page);

    const state = await getTestState(page);
    expect(state.gameState).not.toBeNull();
    const playerIds = Object.keys(state.gameState.players);
    // Local player + bots (default 3)
    expect(playerIds.length).toBe(4);
  });

  test("local player exists and is alive", async ({ page }) => {
    await startLocalGame(page);

    const state = await getTestState(page);
    const localPlayer = state.gameState.players["local-player"];
    expect(localPlayer).toBeDefined();
    expect(localPlayer.alive).toBe(true);
    expect(localPlayer.hp).toBeGreaterThan(0);
  });

  test("game state has gravity wells from selected map", async ({ page }) => {
    await startLocalGame(page);

    const state = await getTestState(page);
    expect(state.gameState.gravityWells.length).toBeGreaterThan(0);
  });

  test("game state has correct mode", async ({ page }) => {
    // Default mode is index 0 = deathmatch
    await startLocalGame(page);

    const state = await getTestState(page);
    expect(state.gameState.gameMode).toBe("deathmatch");
  });

  test("duel mode uses exactly 1 bot", async ({ page }) => {
    // Select duel mode (index 3)
    await page.keyboard.press("c"); // mode 1
    await page.keyboard.press("c"); // mode 2
    await page.keyboard.press("c"); // mode 3 (duel)

    let state = await getTestState(page);
    expect(state.selectedMode).toBe(3);

    await startLocalGame(page);

    state = await getTestState(page);
    expect(state.gameState.gameMode).toBe("duel");
    const playerIds = Object.keys(state.gameState.players);
    expect(playerIds.length).toBe(2); // local + 1 bot
  });

  test("different ship selections affect player config", async ({ page }) => {
    // Select Titan (index 1)
    await page.keyboard.press("2");
    await startLocalGame(page);

    const state = await getTestState(page);
    const localPlayer = state.gameState.players["local-player"];
    expect(localPlayer.shipClass).toBe("titan");
    expect(localPlayer.maxHp).toBe(220); // Titan HP
  });

  test("canvas renders during gameplay", async ({ page }) => {
    await startLocalGame(page);
    // Wait a bit for rendering
    await page.waitForTimeout(500);

    const canvas = page.locator("canvas#gameCanvas");
    const screenshot = await canvas.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(5000);
  });

  test("game continues to run (state updates over time)", async ({ page }) => {
    await startLocalGame(page);

    // Capture initial time remaining
    const state1 = await getTestState(page);
    const time1 = state1.gameState.timeRemaining;

    // Wait a bit
    await page.waitForTimeout(1500);

    // Time should have decreased
    const state2 = await getTestState(page);
    const time2 = state2.gameState.timeRemaining;
    expect(time2).toBeLessThan(time1);
  });

  test("keyboard input affects player (WASD movement)", async ({ page }) => {
    await startLocalGame(page);
    await page.waitForTimeout(300);

    // Record initial position
    const state1 = await getTestState(page);
    const pos1 = state1.gameState.players["local-player"].position;

    // Hold W (thrust up) for a bit
    await page.keyboard.down("w");
    await page.waitForTimeout(500);
    await page.keyboard.up("w");
    await page.waitForTimeout(100);

    // Position should have changed
    const state2 = await getTestState(page);
    const pos2 = state2.gameState.players["local-player"].position;
    const moved = Math.abs(pos2.x - pos1.x) + Math.abs(pos2.y - pos1.y);
    expect(moved).toBeGreaterThan(5);
  });

  test("no console errors during gameplay", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await startLocalGame(page);
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test("bot count setting affects game", async ({ page }) => {
    await page.keyboard.press("Enter"); // menu → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");

    // Set bot count to 1
    await page.keyboard.press("ArrowDown"); // 3→2
    await page.keyboard.press("ArrowDown"); // 2→1

    let state = await getTestState(page);
    expect(state.selectedBotCount).toBe(1);

    await page.keyboard.press("Enter"); // start game
    await waitForScreen(page, "playing");

    state = await getTestState(page);
    const playerIds = Object.keys(state.gameState.players);
    expect(playerIds.length).toBe(2); // local + 1 bot
  });

  test("mod selection persists into gameplay", async ({ page }) => {
    await page.keyboard.press("Enter"); // menu → mod-select
    await waitForScreen(page, "mod-select");

    // Select weapon mod 2 (gravity-sync, index 1 = key "2")
    await page.keyboard.press("2");

    // Select ship mod 3 (drift-master, index 2 = Ctrl+3)
    await page.keyboard.press("Control+3");

    // Select passive mod 4 (radar, index 3 = Shift+4)
    await page.keyboard.press("Shift+4");

    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    const state = await getTestState(page);
    const player = state.gameState.players["local-player"];
    expect(player.mods.weapon).toBe("ricochet");      // index 1
    expect(player.mods.ship).toBe("drift-master");     // index 2
    expect(player.mods.passive).toBe("radar");          // index 3
  });

  test("king-of-the-asteroid mode starts correctly", async ({ page }) => {
    await page.keyboard.press("c"); // mode 0→1 (king-of-the-asteroid)

    const menuState = await getTestState(page);
    expect(menuState.selectedMode).toBe(1);

    await startLocalGame(page);

    const state = await getTestState(page);
    expect(state.gameState.gameMode).toBe("king-of-the-asteroid");
  });

  test("gravity-shift mode starts correctly", async ({ page }) => {
    await page.keyboard.press("c"); // mode 0→1
    await page.keyboard.press("c"); // mode 1→2 (gravity-shift)

    const menuState = await getTestState(page);
    expect(menuState.selectedMode).toBe(2);

    await startLocalGame(page);

    const state = await getTestState(page);
    expect(state.gameState.gameMode).toBe("gravity-shift");
  });

  test("map selection affects game state", async ({ page }) => {
    // Select asteroid-belt (index 1)
    await page.keyboard.press("e"); // map 0→1

    await startLocalGame(page);

    const state = await getTestState(page);
    expect(state.gameState.mapId).toBe("asteroid-belt");
    // Asteroid Belt has 3 gravity wells vs Nebula Station's 2
    expect(state.gameState.gravityWells.length).toBe(3);
  });

  test("control mode selection persists into gameplay", async ({ page }) => {
    await page.keyboard.press("Enter"); // menu → mod-select
    await waitForScreen(page, "mod-select");

    // Switch to ship-relative
    await page.keyboard.press("Tab");
    const modState = await getTestState(page);
    expect(modState.selectedControlMode).toBe(1);

    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    const state = await getTestState(page);
    const player = state.gameState.players["local-player"];
    expect(player.controlMode).toBe("ship-relative");
  });
});
