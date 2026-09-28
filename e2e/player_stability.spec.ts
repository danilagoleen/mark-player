import { expect, test } from "@playwright/test";

const VIDEO_FIXTURE = "/Users/danilagulin/Documents/VETKA_Project/vetka_live_03/tools/back_to_ussr_app/docs/media/demo.mp4";
const IMAGE_FIXTURE = "/Users/danilagulin/work/teletape_temp/berlin/style_lor/66187f5e-acf9-43bc-b3f6-49e697380b06.png";
const PORTRAIT_IMAGE_FIXTURE = "/Users/danilagulin/work/teletape_temp/berlin/style_lor/319692_photo.jpg";

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

  await page.getByTestId("fullscreen-button").click();
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

  await page.locator(".hud-button").click();
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
  await page.locator('input[type="file"]').setInputFiles(IMAGE_FIXTURE);

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
  await page.locator('input[type="file"]').setInputFiles(PORTRAIT_IMAGE_FIXTURE);

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
