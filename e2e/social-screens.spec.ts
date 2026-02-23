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
    await page.keyboard.press("Enter"); // menu → mod-select
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
