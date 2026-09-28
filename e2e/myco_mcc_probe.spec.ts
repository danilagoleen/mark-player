import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("capture MYCO MCC probe screenshot and snapshot", async ({ page }) => {
  const assetPath = process.env.MYCO_PROBE_ASSET_PATH || "";
  const screenshotPath = process.env.MYCO_PROBE_SCREENSHOT_PATH || "";
  const snapshotPath = process.env.MYCO_PROBE_SNAPSHOT_PATH || "";
  const surface = process.env.MYCO_PROBE_SURFACE || "top_avatar";
  const state = process.env.MYCO_PROBE_STATE || "idle";

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?mode=myco&surface=${encodeURIComponent(surface)}&state=${encodeURIComponent(state)}`);

  if (assetPath) {
    await page.locator('[data-testid="myco-probe-file-input"]').setInputFiles(assetPath);
  }

  await page.waitForFunction(() => {
    const snapshot = window.vetkaMycoProbe?.snapshot();
    return Boolean(snapshot?.ok && snapshot.surfaceWidth > 0 && snapshot.slotWidth > 0);
  });

  await page.waitForTimeout(500);

  const snapshot = await page.evaluate(() => window.vetkaMycoProbe?.snapshot());
  expect(snapshot).toBeTruthy();
  expect(snapshot?.ok).toBe(true);

  if (snapshotPath) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  if (screenshotPath) {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
});
