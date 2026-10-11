import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791233033_7043_2: манифест агента — схема + testid резолвятся в DOM.
const VIDEO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/subs_5s.mp4",
);

async function openVideo(page) {
  await page.goto("/");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.viewerWidth > 0 && snapshot.sourceKind === "video");
  });
}

test("manifest() жив, схема валидна, api без дрейфа", async ({ page }) => {
  await openVideo(page);
  const manifest = await page.evaluate(() => window.vetkaPlayerLab?.manifest());
  expect(manifest.player).toBe("Mark Player");
  expect(typeof manifest.version).toBe("string");
  expect(manifest.controls.length).toBeGreaterThan(0);
  // api — по факту из Object.keys: ключи зовутся без исключений.
  expect(manifest.api).toContain("manifest");
  for (const name of ["openFile", "addMomentMarker", "getFileName", "snapshot"]) {
    expect(manifest.api).toContain(name);
  }
});

test("testid из манифеста резолвятся в DOM", async ({ page }) => {
  await openVideo(page);
  const testids: string[] = await page.evaluate(
    () => window.vetkaPlayerLab?.manifest().controls.map((c) => c.testid) ?? [],
  );
  // Видео открыто: все when=video контролы в DOM.
  for (const id of [
    "transport-play-pause",
    "transport-progress",
    "transport-mute",
    "seek-backward",
    "seek-forward",
    "marker-favorite",
    "marker-negative",
    "marker-in",
    "marker-out",
    "marker-comment",
    "corner-playlist",
    "corner-markers",
    "context-action",
  ]) {
    expect(testids).toContain(id);
    await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(1);
  }
});

test("пустое окно: viewer-open в DOM", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="viewer-open"]')).toHaveCount(1);
});
