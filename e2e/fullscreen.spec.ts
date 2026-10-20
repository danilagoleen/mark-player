import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791146301_70644_14 п.3: регрессия «пол-экрана чёрного».
// Вход/выход фулскрина ×3: в фулскрине кадр обязан покрывать окно
// (сигнатура бага — маленькое видео сверху + чернота снизу),
// после выхода шелл возвращается к px-размеру.
const VIDEO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/subs_5s.mp4",
);

interface FsProbe {
  isFs: boolean;
  videoW: number;
  videoH: number;
  winW: number;
  winH: number;
}

async function openVideo(page) {
  await page.goto("/");
  await page.locator('input[accept*="video/*"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.viewerWidth > 0 && snapshot.sourceKind === "video");
  });
}

async function probe(page): Promise<FsProbe> {
  return page.evaluate(() => {
    const video = document.querySelector("video");
    const r = video?.getBoundingClientRect() ?? { width: 0, height: 0 };
    return {
      isFs: Boolean(document.fullscreenElement),
      videoW: r.width,
      videoH: r.height,
      winW: window.innerWidth,
      winH: window.innerHeight,
    };
  });
}

async function enter(page) {
  await page.evaluate(() => window.vetkaPlayerLab?.toggleFullscreen());
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  // settle: двойной rAF в коде + перечёт snapshot.
  await page.waitForTimeout(500);
}

async function exit(page) {
  await page.evaluate(() => window.vetkaPlayerLab?.toggleFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.waitForTimeout(500);
}

test("fullscreen ×3: кадр покрывает окно, выход возвращает размер", async ({ page }) => {
  await openVideo(page);
  const before = await probe(page);
  expect(before.isFs).toBe(false);
  expect(before.videoH).toBeGreaterThan(0);

  for (let i = 0; i < 3; i++) {
    await enter(page);
    const fs = await probe(page);
    expect(fs.isFs).toBe(true);
    // Сигнатура бага: videoH ~1/3 окна. Требуем не меньше половины.
    expect(fs.videoH).toBeGreaterThan(fs.winH * 0.5);
    expect(fs.videoW).toBeGreaterThan(0);
    // Трейс приземлился и sane.
    const trace = await page.evaluate(() => window.vetkaPlayerLab?.fullscreenTrace());
    expect(trace).not.toBeNull();
    expect(trace?.isFullscreen).toBe(true);
    expect(trace?.videoHeight ?? 0).toBeGreaterThan((trace?.windowInnerHeight ?? 0) * 0.5);

    await exit(page);
    const back = await probe(page);
    expect(back.isFs).toBe(false);
    // Шелл вернулся к оконному размеру (±10% — допуск на rounding/relayout).
    expect(back.videoH).toBeGreaterThan(before.videoH * 0.9);
    expect(back.videoH).toBeLessThan(Math.max(before.videoH * 1.1, before.videoH + 40));
  }
});
