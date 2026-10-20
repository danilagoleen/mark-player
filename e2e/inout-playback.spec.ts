import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791143015_70644_7: In–Out Play ОДНОГО видео (скоуп поправки Commander).
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

async function mark(page, kind: "in" | "out") {
  return page.evaluate((k) => window.vetkaPlayerLab?.addMomentMarker(k), kind);
}

async function markPair(page, inSec: number, outSec: number) {
  // Пауза: автостарт при открытии иначе уводит плейхед во время разметки.
  await page.evaluate(() => document.querySelector("video")?.pause());
  await seek(page, inSec);
  await mark(page, "in");
  await seek(page, outSec);
  await mark(page, "out");
}

async function playToEnd(page) {
  await seek(page, 0.1);
  await ensurePlaying(page);
  // played-through ставится в onEnded — сегменты активируются после него.
  await page.waitForFunction(
    () => (window.localStorage.getItem("vetka_player_lab_played_through_v1") ?? "").includes("subs_5s.mp4"),
    { timeout: 20000 },
  );
}

// Открытие само стартует воспроизведение (useEffect [src] в App) —
// клик по play в гонке с pending-автостартом ставит паузу навсегда.
// Поэтому кликаем только если реально на паузе.
async function ensurePlaying(page) {
  const playing = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v !== null && !v.paused && !v.ended;
  });
  if (!playing) {
    await page.getByTestId("transport-play-pause").click();
  }
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && (!v.paused || v.ended);
  }, { timeout: 10000 });
}

test("пересечение OUT во время проигрывания — прыжок на следующий сегмент", async ({ page }) => {
  await openVideo(page);
  await markPair(page, 1, 2);
  await markPair(page, 3, 4);
  await playToEnd(page);
  await seek(page, 0.2);
  await ensurePlaying(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.currentTime >= 1.95;
  }, { timeout: 10000 });
  // Разрыв [2,3] пролетается, а не играется: 1.95 → 2.95 быстрее секунды.
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.currentTime >= 2.95;
  }, { timeout: 2500 });
});

test("S выключает тумблер — внешнее играется", async ({ page }) => {
  await openVideo(page);
  await markPair(page, 1, 2);
  await markPair(page, 3, 4);
  await playToEnd(page);
  await page.keyboard.press("s");
  await seek(page, 0.2);
  await ensurePlaying(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.currentTime >= 2.05;
  }, { timeout: 10000 });
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => document.querySelector("video")?.currentTime ?? 0);
  // Без прыжка плейхед остался бы в разрыве [2,3]; с прыжком был бы ≥3.
  expect(t).toBeGreaterThan(2.05);
  expect(t).toBeLessThan(3.0);
});

test("скобка внутрь закрытой пары не ставится", async ({ page }) => {
  await openVideo(page);
  await markPair(page, 1, 4);
  await seek(page, 2);
  const refused = await mark(page, "in");
  expect(refused).toBeNull();
  const inCount = await page.evaluate(
    () => window.vetkaPlayerLab?.markers().filter((m) => m.kind === "in").length ?? -1,
  );
  expect(inCount).toBe(1);
});

test("tb_1791346266_38729_2: in,in,out — внутренняя резка играет до конца без прыжков", async ({ page }) => {
  await openVideo(page);
  await page.evaluate(() => document.querySelector("video")?.pause());
  await seek(page, 1);
  await mark(page, "in");
  await seek(page, 2);
  await mark(page, "in");
  await seek(page, 3);
  await mark(page, "out");
  await playToEnd(page);
  // Пара (2,3) + одиночка in1 до конца: с 0.2 доигрывает до конца,
  // на OUT 3 нет следующего сегмента — прыжка нет, застревания нет.
  await seek(page, 0.2);
  await ensurePlaying(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && (v.ended || v.currentTime >= 4.5);
  }, { timeout: 15000 });
});
