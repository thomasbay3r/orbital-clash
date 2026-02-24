import { test, expect } from "@playwright/test";
import { waitForGameReady, waitForScreen, getTestState } from "./helpers";

test.describe("Tutorial System", () => {
  test.beforeEach(async ({ page }) => {
    // Clear tutorial state before loading the game
    await page.addInitScript(() => {
      localStorage.removeItem("tutorialEnabled");
      localStorage.removeItem("tutorialSeen");
    });
    await page.goto("/");
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
    // tutorialActive is set during the render loop, so poll for it
    await expect(async () => {
      const state = await getTestState(page);
      expect(state.tutorialActive).toBe("profile");
    }).toPass({ timeout: 3_000 });
  });

  test("Enter dismisses tutorial banner", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    // Wait for banner to appear (set by render loop)
    await expect(async () => {
      const state = await getTestState(page);
      expect(state.tutorialActive).toBe("profile");
    }).toPass({ timeout: 3_000 });
    await page.keyboard.press("Enter");
    // Small wait for state update
    await page.waitForTimeout(100);
    const state = await getTestState(page);
    expect(state.tutorialActive).toBeNull();
  });

  test("tutorial does not show on second visit", async ({ page }) => {
    // First visit - wait for banner, then dismiss
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    await expect(async () => {
      const s = await getTestState(page);
      expect(s.tutorialActive).toBe("profile");
    }).toPass({ timeout: 3_000 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    // Go back and return
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    // Give render loop a frame to potentially set tutorialActive
    await page.waitForTimeout(100);
    const state = await getTestState(page);
    expect(state.tutorialActive).toBeNull();
  });

  test("T key disables all tutorials", async ({ page }) => {
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    // Wait for banner to appear before pressing T
    await expect(async () => {
      const s = await getTestState(page);
      expect(s.tutorialActive).toBe("profile");
    }).toPass({ timeout: 3_000 });
    await page.keyboard.press("t");
    await page.waitForTimeout(100);
    // Go to another screen - should not show tutorial
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
    await page.waitForTimeout(100);
    await page.keyboard.press("Enter");
    await waitForScreen(page, "game-config");
    // Give render loop a frame to verify no tutorial appears
    await page.waitForTimeout(100);
    const state = await getTestState(page);
    expect(state.tutorialActive).toBeNull();
    expect(state.tutorialEnabled).toBe(false);
  });

  test("tutorial overlay shows on first game-config visit", async ({ page }) => {
    await page.keyboard.press("Enter");
    await waitForScreen(page, "game-config");
    // tutorialActive is set during the render loop, so poll for it
    await expect(async () => {
      const state = await getTestState(page);
      expect(state.tutorialActive).toBe("game-config");
    }).toPass({ timeout: 3_000 });
  });

  test("R key in help screen resets tutorial", async ({ page }) => {
    // Dismiss a tutorial first
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    // Wait for banner to appear before dismissing
    await expect(async () => {
      const s = await getTestState(page);
      expect(s.tutorialActive).toBe("profile");
    }).toPass({ timeout: 3_000 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
    // Go to help, press R
    await page.keyboard.press("h");
    await waitForScreen(page, "help");
    await page.keyboard.press("r");
    // Go back and check profile shows tutorial again
    await page.keyboard.press("Escape");
    await waitForScreen(page, "menu");
    await page.keyboard.press("p");
    await waitForScreen(page, "profile");
    // Wait for the render loop to set tutorialActive
    await expect(async () => {
      const state = await getTestState(page);
      expect(state.tutorialActive).toBe("profile");
    }).toPass({ timeout: 3_000 });
  });
});
