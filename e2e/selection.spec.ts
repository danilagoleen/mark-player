import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791172090_2308_6 п.1: строка in-out — только СУММА, EN, оверлеем
// (не раздвигает транспорт), нет пар — элемента нет в DOM.
// Якоря маркеров = живой currentTime (±0.35 допуска seek), поэтому пара
// ставится с зазором 3с (1→4): сумма всегда в [2.3, 3.7] → секунды 02|03.
const VIDEO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/subs_5s.mp4",
);

async function openVideo(page) {
  await page.goto("/");
  await page.locator('input[accept*="video/*"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.viewerWidth > 0 && snapshot.sourceKind === "video");
  });
}

async function seek(page, t: number) {
  await page.evaluate((sec) => {
    const video = document.querySelector("video");
    if (video) video.currentTime = sec;
  }, t);
  await page.waitForFunction((sec) => {
    const video = document.querySelector("video");
    return video !== null && Math.abs(video.currentTime - sec) < 0.35;
  }, t);
}

test("нет in-out — строки нет в DOM", async ({ page }) => {
  await openVideo(page);
  await expect(page.getByTestId("transport-selection")).toHaveCount(0);
});

test("пара in-out: только EN-сумма, без «из <длительность>»", async ({ page }) => {
  await openVideo(page);
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("in", ""));
  await seek(page, 4);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("out", ""));
  const row = page.getByTestId("transport-selection");
  await expect(row).toContainText(/In-out total 00:00:0[23]:\d{2}/);
  await expect(row).not.toContainText(/из/);
  await expect(row).not.toContainText(/выбрано/);
});

test("строка — оверлей: высота бара не меняется при появлении", async ({ page }) => {
  await openVideo(page);
  const bar = page.locator(".transport-bar");
  const before = await bar.boundingBox();
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("in", ""));
  await seek(page, 4);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("out", ""));
  await expect(page.getByTestId("transport-selection")).toBeVisible();
  const pos = await page.getByTestId("transport-selection").evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe("absolute");
  const after = await bar.boundingBox();
  expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThanOrEqual(1);
});

// tb_1791233964_7043_5: строка in-out не налезает на шкалу — боксы
// selection и прогресс-бара не пересекаются (узкое 720 и широкое 1280 окно).
for (const width of [720, 1280]) {
  test(`строка не пересекает шкалу на ширине ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await openVideo(page);
    await seek(page, 1);
    await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("in", ""));
    await seek(page, 4);
    await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("out", ""));
    const row = page.getByTestId("transport-selection");
    await expect(row).toBeVisible();
    const rb = await row.boundingBox();
    const pb = await page.locator(".transport-progress-wrap").boundingBox();
    expect(rb && pb ? intersects(rb, pb) : false).toBe(false);
  });
}

function intersects(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;
}
