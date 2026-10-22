import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1792636926_72740_4: оператор сообщил о пропаже покадровой перемотки
// стрелками в сборке 0.26.0, но не смог подтвердить (обе сборки несли один
// штамп). Держим живой регресс на реальном <video>: шаг равен одному кадру
// 30-fps фикстуры, назад — симметрично. Пауза обязательна: иначе к дельте
// примешивается проигрывание за время ожидания.
const dir = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_FIXTURE = path.resolve(dir, "fixtures/subs_5s.mp4");
const FRAME_SEC = 1 / 30;

async function openPausedVideo(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    return Boolean(video && video.readyState >= 2);
  });
  await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    video?.pause();
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.waitForTimeout(50);
}

async function currentTime(page: Page): Promise<number> {
  return page.evaluate(() => Number((document.querySelector("video") as HTMLVideoElement | null)?.currentTime ?? 0));
}

test("←/→ step exactly one frame on a paused video", async ({ page }) => {
  await openPausedVideo(page);
  const start = await currentTime(page);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(120);
  const forward = await currentTime(page);
  expect(Math.abs(forward - start - FRAME_SEC)).toBeLessThan(0.02);

  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(120);
  const back = await currentTime(page);
  expect(Math.abs(back - start)).toBeLessThan(0.02);
});
