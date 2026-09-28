import { expect, test } from "@playwright/test";

const VIDEO_FIXTURE = "/Users/danilagulin/Documents/VETKA_Project/vetka_live_03/artifacts/myco_motion/team_A/architect/primary/architect_master.mp4";

test.describe("Vision Tags E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.goto("/?debug=1");
    await page.locator('input[accept="video/*,image/*"]').first().setInputFiles(VIDEO_FIXTURE);
    await page.waitForFunction(() => {
      const s = window.vetkaPlayerLab?.snapshot();
      return Boolean(s?.ok && s?.sourceKind === "video");
    });
  });

  test("vision analysis badge appears after opening chat", async ({ page }) => {
    await page.locator(".chat-toggle").click();
    await page.waitForSelector("[data-testid='chat-panel']");

    const badge = page.locator(".chat-vision-badge");
    await expect(badge).toBeVisible({ timeout: 10000 });
  });

  test("vision tags container appears after analysis", async ({ page }) => {
    await page.locator(".chat-toggle").click();
    await page.waitForSelector("[data-testid='chat-panel']");

    const tags = page.locator(".chat-vision-tags");
    await expect(tags).toBeVisible({ timeout: 15000 });

    const shot = page.locator(".vision-tag--shot_scale");
    await expect(shot).toBeVisible();
  });

  test("analyze-frame API endpoint returns vision data", async ({ page }) => {
    await page.waitForFunction(() => {
      const ctx = window.vetkaPlayerLab?.getFoveaContext?.();
      return ctx && ctx.frame_b64 && ctx.width > 0;
    }, { timeout: 10000 });

    const result = await page.evaluate(async () => {
      const ctx = window.vetkaPlayerLab?.getFoveaContext();
      if (!ctx?.frame_b64) return null;
      const res = await fetch("/api/cut/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_b64: ctx.frame_b64 }),
      });
      if (!res.ok) return null;
      return res.json();
    });

    expect(result).toBeTruthy();
    expect(result?.shot_scale).toBeDefined();
    expect(result?.light_profile).toBeDefined();
    expect(Array.isArray(result?.dominant_colors)).toBe(true);
  });
});
