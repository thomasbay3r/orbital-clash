import { test, expect } from "@playwright/test";
import { getTestState, waitForScreen, waitForGameReady } from "./helpers";

test.describe("Social Screens Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);
  });

  test("F key does not open friends for guest user (requires account)", async ({ page }) => {
    // Friends screen requires account auth, guest users stay on menu
    await page.keyboard.press("f");
    await page.waitForTimeout(200);
    const state = await getTestState(page);
    expect(state.screen).toBe("menu");
  });

  test("P key opens profile screen from menu", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
  });

  test("Escape returns from profile to menu", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
  });

  test("L key opens login screen from menu", async ({ page }) => {
    await page.keyboard.press("l");
    await waitForScreen(page, "login");
  });

  test("Escape returns from login to menu", async ({ page }) => {
    await page.keyboard.press("l");
    await waitForScreen(page, "login");
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
  });

  test("R key in login opens register screen", async ({ page }) => {
    await page.keyboard.press("l");
    await waitForScreen(page, "login");
    await page.keyboard.press("r");
    await waitForScreen(page, "register");
  });

  test("Escape returns from register to login", async ({ page }) => {
    await page.keyboard.press("l");
    await waitForScreen(page, "login");
    await page.keyboard.press("r");
    await waitForScreen(page, "register");
    await page.keyboard.press("Escape");
    await waitForScreen(page, "login");
  });
});

test.describe("Kill Feed & Post-Game State", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);
  });

  test("game state includes killFeed array", async ({ page }) => {
    // Start a local game
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    const state = await getTestState(page);
    expect(state.killFeed).toBeDefined();
    expect(Array.isArray(state.killFeed)).toBe(true);
  });

  test("game state exposes currentUser", async ({ page }) => {
    const state = await getTestState(page);
    // currentUser may be null initially (guest init is async), or set
    expect("currentUser" in state).toBe(true);
  });
});

test.describe("Challenges & Cosmetics Screens", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);
  });

  test("C key from profile opens challenges screen", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("c");
    await waitForScreen(page, "challenges");
  });

  test("Escape from challenges returns to profile", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("c");
    await waitForScreen(page, "challenges");
    await page.keyboard.press("Escape");
    await waitForScreen(page, "profile");
  });

  test("K key from profile opens cosmetics screen", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("k");
    await waitForScreen(page, "cosmetics");
  });

  test("Escape from cosmetics returns to profile", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("k");
    await waitForScreen(page, "cosmetics");
    await page.keyboard.press("Escape");
    await waitForScreen(page, "profile");
  });

  test("cosmetics category can be changed with 1-4 keys", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await page.keyboard.press("k");
    await waitForScreen(page, "cosmetics");

    let state = await getTestState(page);
    expect(state.cosmeticCategory).toBe(0); // skins

    await page.keyboard.press("2");
    state = await getTestState(page);
    expect(state.cosmeticCategory).toBe(1); // trails

    await page.keyboard.press("4");
    state = await getTestState(page);
    expect(state.cosmeticCategory).toBe(3); // titles
  });

  test("challenges are initialized after playing a game", async ({ page }) => {
    // Start and play a quick game
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    // Check that challenges were initialized
    const state = await getTestState(page);
    expect(state.dailyChallenges.length).toBe(3);
    expect(state.weeklyChallenges.length).toBe(3);
  });

  test("test state exposes unlockedAchievements", async ({ page }) => {
    const state = await getTestState(page);
    expect(state.unlockedAchievements).toBeDefined();
    expect(Array.isArray(state.unlockedAchievements)).toBe(true);
  });
});

test.describe("Polish Features (Phase 4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForGameReady(page);
  });

  test("emote wheel starts closed", async ({ page }) => {
    // Start a local game
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    const state = await getTestState(page);
    expect(state.emoteWheelOpen).toBe(false);
  });

  test("V key toggles emote wheel during gameplay", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    await page.keyboard.press("v");
    let state = await getTestState(page);
    expect(state.emoteWheelOpen).toBe(true);

    await page.keyboard.press("v");
    state = await getTestState(page);
    expect(state.emoteWheelOpen).toBe(false);
  });

  test("Escape closes emote wheel", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    await page.keyboard.press("v");
    let state = await getTestState(page);
    expect(state.emoteWheelOpen).toBe(true);

    await page.keyboard.press("Escape");
    state = await getTestState(page);
    expect(state.emoteWheelOpen).toBe(false);
  });

  test("killStreak starts at zero", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    const state = await getTestState(page);
    expect(state.killStreak).toBe(0);
  });

  test("slowmo starts inactive", async ({ page }) => {
    await page.keyboard.press("Enter"); // hub → game-config
    await waitForScreen(page, "game-config");
    await page.keyboard.press("Enter"); // game-config → mod-select
    await waitForScreen(page, "mod-select");
    await page.keyboard.press("Enter"); // mod-select → settings
    await waitForScreen(page, "settings");
    await page.keyboard.press("Enter"); // settings → playing
    await waitForScreen(page, "playing");

    const state = await getTestState(page);
    expect(state.slowmoActive).toBe(false);
  });
});
