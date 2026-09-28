import { expect, test } from "@playwright/test";

const VIDEO_FIXTURE = "/Users/danilagulin/Documents/VETKA_Project/vetka_live_03/artifacts/myco_motion/team_A/architect/primary/architect_master.mp4";

test.describe("Chat + FOVEA E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.goto("/?debug=1");
    await page.locator('input[accept="video/*,image/*"]').first().setInputFiles(VIDEO_FIXTURE);
    await page.waitForFunction(() => {
      const s = window.vetkaPlayerLab?.snapshot();
      return Boolean(s?.ok && s?.sourceKind === "video");
    });
  });

  test("chat toggle button is visible on video", async ({ page }) => {
    const toggle = page.locator(".chat-toggle");
    await expect(toggle).toBeVisible();
  });

  test("chat panel opens and shows header", async ({ page }) => {
    await page.locator(".chat-toggle").click();
    const panel = page.locator("[data-testid='chat-panel']");
    await expect(panel).toBeVisible();
    await expect(panel.locator("text=Agent Chat")).toBeVisible();
  });

  test("chat panel closes on close button", async ({ page }) => {
    await page.locator(".chat-toggle").click();
    await expect(page.locator("[data-testid='chat-panel']")).toBeVisible();
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>(".chat-close");
      btn?.click();
    });
    await expect(page.locator("[data-testid='chat-panel']")).not.toBeVisible();
  });

  test("typing in chat input enables send button", async ({ page }) => {
    await page.locator(".chat-toggle").click();
    const input = page.locator(".chat-input");
    await input.fill("test message");
    await expect(page.locator(".chat-send")).toBeEnabled();
  });

  test("FOVEA context is available via API", async ({ page }) => {
    await page.waitForFunction(() => {
      const ctx = window.vetkaPlayerLab?.getFoveaContext?.();
      return ctx && ctx.width > 0 && ctx.height > 0;
    }, { timeout: 10000 });
    const ctx = await page.evaluate(() => window.vetkaPlayerLab?.getFoveaContext?.());
    expect(ctx).toBeTruthy();
    expect(ctx?.timecode).toBeDefined();
    expect(ctx?.width).toBeGreaterThan(0);
    expect(ctx?.height).toBeGreaterThan(0);
  });
});
