import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const DEFAULT_VIDEO_FIXTURE = "/Users/danilagulin/Documents/VETKA_Project/vetka_live_03/tools/back_to_ussr_app/docs/media/demo.mp4";

test("capture player review screenshot and geometry snapshot", async ({ page }) => {
  const videoPath = process.env.PLAYER_LAB_VIDEO_PATH || DEFAULT_VIDEO_FIXTURE;
  const screenshotPath = process.env.PLAYER_LAB_SCREENSHOT_PATH || "";
  const snapshotPath = process.env.PLAYER_LAB_SNAPSHOT_PATH || "";
  const useSynthetic = !videoPath;

  await page.setViewportSize({ width: 1600, height: 1080 });
  await page.goto("/");

  if (useSynthetic) {
    await page.evaluate(() => {
      window.vetkaPlayerLab?.setSyntheticSize(1280, 720);
    });
    await page.waitForFunction(() => Boolean(window.vetkaPlayerLab?.snapshot()?.ok));
    await page.evaluate(() => {
      window.vetkaPlayerLab?.applySuggestedShell();
    });
  } else {
    await page.locator('input[type="file"]').setInputFiles(videoPath);
  }

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.viewerWidth > 0 && snapshot.viewerHeight > 0);
  });

  await page.waitForTimeout(700);

  let snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(snapshot).toBeTruthy();
  expect(snapshot?.ok).toBe(true);

  if (snapshot) {
    const compactWidth = Math.max(980, Math.ceil(snapshot.shellWidth + 56));
    const compactHeight = Math.max(
      680,
      Math.ceil(snapshot.shellHeight + snapshot.topbarHeight + 48),
    );
    await page.setViewportSize({ width: compactWidth, height: compactHeight });
    await page.evaluate(() => window.vetkaPlayerLab?.applySuggestedShell());
    await page.waitForTimeout(250);
    snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  }

  if (snapshotPath) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
});
