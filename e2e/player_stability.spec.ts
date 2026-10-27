import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791169872_2308_5: было — абсолютные фикстуры мёртвых машин
// (demo.mp4 удалён, картинки из /Users/.../teletape_temp) + мёртвые
// селекторы (.hud-button, [data-testid="fullscreen-button"] снесены).
// Стало — локальные фикстуры e2e/fixtures + живой debug-API и testid.
const dir = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_FIXTURE = path.resolve(dir, "fixtures/subs_5s.mp4");
const IMAGE_FIXTURE = path.resolve(dir, "fixtures/landscape.png");
const PORTRAIT_IMAGE_FIXTURE = path.resolve(dir, "fixtures/portrait.jpg");

test("pure player shell expands with viewport resize without changing action mode", async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 680 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.viewerWidth > 0 && snapshot.sourceKind === "video");
  });

  const before = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(before?.activeContextAction).toBe("vetka");

  await page.setViewportSize({ width: 1320, height: 900 });
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot && snapshot.windowInnerWidth >= 1320 && snapshot.viewerWidth > 0);
  });

  const after = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(after?.viewerWidth).toBeGreaterThan(before?.viewerWidth ?? 0);
  expect(after?.viewerHeight).toBeGreaterThan(before?.viewerHeight ?? 0);
  expect(after?.activeContextAction).toBe("vetka");
});

test("fullscreen button requests fullscreen in web sandbox", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 840 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.sourceKind === "video");
  });

  // Отдельной кнопки фулскрина в UI больше нет (вход — хоткей/тумблер);
  // глубокий регресс «пол-экрана чёрного» живёт в fullscreen.spec.ts.
  // Здесь — что запрос фулскрина через API в песочнице срабатывает.
  await page.evaluate(() => window.vetkaPlayerLab?.toggleFullscreen());
  await page.waitForFunction(() => Boolean(document.fullscreenElement));

  const isFullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
  expect(isFullscreen).toBe(true);
});

test("center play button toggles playback without seek jump", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 840 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot?.sourceKind === "video");
  });

  const before = await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    return Number(video?.currentTime || 0);
  });

  await page.getByTestId("transport-play-pause").click();
  await page.waitForTimeout(150);

  const after = await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    return Number(video?.currentTime || 0);
  });

  expect(Math.abs(after - before)).toBeLessThan(0.25);
});

test("video shows a real first frame preview before playback", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 840 });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    const video = document.querySelector("video") as HTMLVideoElement | null;
    return Boolean(snapshot?.ok && snapshot.sourceKind === "video" && video && video.readyState >= 2);
  });

  const sample = await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    if (!video) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 8, 8);
    const { data } = ctx.getImageData(0, 0, 8, 8);
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      total += data[index] + data[index + 1] + data[index + 2];
    }
    return {
      averageBrightness: total / (data.length / 4) / 3,
      currentTime: Number(video.currentTime || 0),
    };
  });

  expect(sample).not.toBeNull();
  expect(sample?.averageBrightness ?? 0).toBeGreaterThan(5);
  expect(sample?.currentTime ?? 0).toBeGreaterThan(0);
});

test("image files load as media and keep geometry stable under suggested shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/?debug=1");
  await page.locator('input[accept*="video/*"]').setInputFiles(IMAGE_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.sourceKind === "image");
  });

  await page.evaluate(() => window.vetkaPlayerLab?.applySuggestedShell());
  await page.waitForTimeout(100);

  const afterFit = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(afterFit?.sourceKind).toBe("image");
  expect(afterFit?.horizontalLetterboxPx ?? 99).toBeLessThanOrEqual(0.5);
  expect(afterFit?.verticalLetterboxPx ?? 99).toBeLessThanOrEqual(0.5);
});

test("portrait images request a portrait-oriented shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/?debug=1");
  await page.locator('input[accept*="video/*"]').setInputFiles(PORTRAIT_IMAGE_FIXTURE);

  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.sourceKind === "image");
  });

  await page.evaluate(() => window.vetkaPlayerLab?.applySuggestedShell());
  await page.waitForTimeout(100);

  const snapshot = await page.evaluate(() => window.vetkaPlayerLab?.snapshot());
  expect(snapshot?.sourceKind).toBe("image");
  expect((snapshot?.suggestedShellHeight ?? 0) > (snapshot?.suggestedShellWidth ?? Number.MAX_SAFE_INTEGER)).toBe(true);
});

test("seek через шкалу сходится к фактическому времени, надписи seeking нет (tb_1792869187_45227_1)", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 840 });
  await page.goto("/");
  await page.locator('input[accept*="video/*"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.sourceKind === "video");
  });

  await page.locator(".transport-progress").fill("3");
  await page.waitForFunction(() => {
    const video = document.querySelector("video") as HTMLVideoElement | null;
    return video !== null && Math.abs(video.currentTime - 3) < 0.35;
  });
  // Декодер догнал: цифра — фактическая позиция
  // (сик сел на сэмпл 2.76, а не ровно на 3.00 — в этом и суть фикса).
  // tb_1792869187_45227_1: бейджа seeking… в приложении больше нет совсем.
  await expect(page.getByTestId("transport-seeking")).toHaveCount(0);
  const text = await page.locator(".transport-time").first().textContent();
  expect(text).toMatch(/00:00:0[23]:\d{2}/);
});

test("бейдж ставки J/L стоит над таймкодом плейхеда (tb_1792869187_45227_1)", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 840 });
  await page.goto("/");
  await page.locator('input[accept*="video/*"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.sourceKind === "video");
  });

  await page.keyboard.press("l");
  const badge = page.getByTestId("transport-shuttle-badge");
  await expect(badge).toContainText("1x");
  const badgeBox = await badge.boundingBox();
  const timeBox = await page.locator(".transport-time").first().boundingBox();
  expect(badgeBox).not.toBeNull();
  expect(timeBox).not.toBeNull();
  // Ставка целиком выше таймкода; сумма in-out живёт под таймкодом,
  // поэтому пересечься с бейджем она больше не может.
  expect(badgeBox!.y + badgeBox!.height).toBeLessThanOrEqual(timeBox!.y);
  expect(await page.getByTestId("transport-seeking").count()).toBe(0);
});
