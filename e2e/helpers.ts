import { Page, expect } from "@playwright/test";

/** Read the game's internal test state via the exposed _testState getter */
export async function getTestState(page: Page) {
  return page.evaluate(() => (window as any).__game._testState);
}

/** Wait until the game reports the expected screen */
export async function waitForScreen(page: Page, screen: string) {
  await expect(async () => {
    const state = await getTestState(page);
    expect(state.screen).toBe(screen);
  }).toPass({ timeout: 5_000 });
}

/** Wait for canvas to be present and game to initialize */
export async function waitForGameReady(page: Page) {
  // Wait for the page to fully load
  await page.waitForLoadState("domcontentloaded");
  // Wait for canvas element to appear
  await page.waitForSelector("canvas#gameCanvas", { timeout: 15_000 });
  // Wait for the Game instance to be available
  await expect(async () => {
    const ready = await page.evaluate(() => !!(window as any).__game);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
  // Give the first frame time to render
  await page.waitForTimeout(300);
}
