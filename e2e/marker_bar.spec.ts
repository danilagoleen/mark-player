import { expect, test } from "@playwright/test";

const VIDEO_FIXTURE = "/Users/danilagulin/Documents/VETKA_Project/vetka_live_03/artifacts/myco_motion/team_A/architect/primary/architect_master.mp4";

test.describe("Marker Bar E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.goto("/?debug=1");
    await page.evaluate(() => {
      window.vetkaPlayerLab?.setSyntheticSize(1280, 720);
    });
    await page.waitForFunction(() => {
      const snapshot = window.vetkaPlayerLab?.snapshot();
      return Boolean(snapshot?.ok);
    });
    await page.evaluate(() => {
      window.vetkaPlayerLab?.applySuggestedShell();
    });
  });

  test("Markers can be added via API and appear in snapshot", async ({ page }) => {
    await page.evaluate(() => {
      window.vetkaPlayerLab?.addMomentMarker("favorite");
      window.vetkaPlayerLab?.addMomentMarker("negative");
      window.vetkaPlayerLab?.addMomentMarker("inout");
      window.vetkaPlayerLab?.addMomentMarker("note", "test note");
    });

    await page.waitForFunction(() => {
      const snapshot = window.vetkaPlayerLab?.snapshot();
      return snapshot?.markerCount === 4;
    });

    const snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
    expect(snapshot?.markerCount).toBe(4);
    expect(snapshot?.favoriteMomentCount).toBe(1);
  });

  test("MarkerBar buttons are visible with video loaded", async ({ page }) => {
    await page.locator('input[accept="video/*,image/*"]').first().setInputFiles(VIDEO_FIXTURE);
    await page.waitForFunction(() => {
      const snapshot = window.vetkaPlayerLab?.snapshot();
      return Boolean(snapshot?.ok && snapshot?.sourceKind === "video");
    });

    const markerBar = page.locator(".marker-bar");
    await expect(markerBar).toBeVisible();
    const buttons = markerBar.locator("button");
    await expect(buttons).toHaveCount(4);
  });

  test("MarkerTimeline shows dots after markers added with video", async ({ page }) => {
    await page.locator('input[accept="video/*,image/*"]').first().setInputFiles(VIDEO_FIXTURE);
    await page.waitForFunction(() => {
      const snapshot = window.vetkaPlayerLab?.snapshot();
      return Boolean(snapshot?.ok && snapshot?.sourceKind === "video");
    });

    await page.evaluate(() => {
      window.vetkaPlayerLab?.addMomentMarker("favorite");
      window.vetkaPlayerLab?.addMomentMarker("inout");
    });

    const dots = page.locator(".marker-dot");
    await expect(dots).toHaveCount(2, { timeout: 5000 });
  });

  test("SRT export produces downloadable content", async ({ page }) => {
    await page.evaluate(() => {
      window.vetkaPlayerLab?.addMomentMarker("favorite");
      window.vetkaPlayerLab?.addMomentMarker("note", "check this");
    });

    const srtBlock = page.locator(".metrics-block", { hasText: "SRT Export/Import" });
    await expect(srtBlock).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }),
      srtBlock.getByRole("button", { name: /Export SRT/ }).click(),
    ]);

    expect(download.suggestedFilename()).toContain(".srt");
  });

  test("SRT import adds markers from uploaded file", async ({ page }) => {
    const srtContent = `1\n00:00:05,000 --> 00:00:06,000\n★ FAVORITE | Favorite\n\n2\n00:00:15,000 --> 00:00:16,000\n✗ NEGATIVE | Negative\n`;
    const blob = await page.evaluate(async (content) => {
      const b = new Blob([content], { type: "text/plain" });
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(b);
      });
    }, srtContent);

    const fileInput = page.locator('input[accept=".srt,text/plain"]');
    const dataUrlParts = blob.split(",");
    const buffer = Buffer.from(dataUrlParts[1], "base64");
    await fileInput.setInputFiles({
      name: "test.srt",
      mimeType: "text/plain",
      buffer,
    });

    await page.waitForFunction(() => {
      const snapshot = window.vetkaPlayerLab?.snapshot();
      return (snapshot?.markerCount ?? 0) >= 2;
    }, { timeout: 5000 });

    const snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
    expect(snapshot?.markerCount).toBeGreaterThanOrEqual(2);
  });
});
