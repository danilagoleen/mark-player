import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Локальная фикстура (генерирована ffmpeg testsrc 5с) — без машинных путей.
const VIDEO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/subs_5s.mp4",
);

const PLAIN_SRT = `1
00:00:01,000 --> 00:00:02,000
Hello track

2
00:00:03,500 --> 00:00:04,500
Second cue
`;

const MARKER_SRT = `1
00:00:01,000 --> 00:00:02,000
★ good moment

2
00:00:03,000 --> 00:00:04,000
✗ bad moment
`;

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

test("subtitle track imports and shows cue text on video time", async ({ page }) => {
  await openVideo(page);
  const count = await page.evaluate((srt) => window.vetkaPlayerLab?.importSubtitlesText(srt), PLAIN_SRT);
  expect(count).toBe(2);
  await seek(page, 1.5);
  await expect(page.getByTestId("subtitle-overlay")).toContainText("Hello track");
  await seek(page, 2.5);
  await expect(page.getByTestId("subtitle-overlay")).toHaveCount(0);
});

test("Show Subtitles toggle hides the overlay", async ({ page }) => {
  await openVideo(page);
  await page.evaluate((srt) => window.vetkaPlayerLab?.importSubtitlesText(srt), PLAIN_SRT);
  await seek(page, 1.5);
  await expect(page.getByTestId("subtitle-overlay")).toContainText("Hello track");
  await page.evaluate(() => window.vetkaPlayerLab?.setSubtitlesVisible(false));
  await expect(page.getByTestId("subtitle-overlay")).toHaveCount(0);
  await page.evaluate(() => window.vetkaPlayerLab?.setSubtitlesVisible(true));
  await expect(page.getByTestId("subtitle-overlay")).toContainText("Hello track");
});

test("marker-prefixed SRT raises hint with create-markers button", async ({ page }) => {
  await openVideo(page);
  const before = await page.evaluate(() => window.vetkaPlayerLab?.markers().length ?? 0);
  await page.evaluate((srt) => window.vetkaPlayerLab?.importSubtitlesText(srt), MARKER_SRT);
  const hint = page.getByTestId("marker-hint-toast");
  await expect(hint).toContainText("Create markers");
  await hint.getByRole("button", { name: "Create markers" }).click();
  await page.waitForFunction(
    (n) => (window.vetkaPlayerLab?.markers().length ?? 0) > n,
    before,
  );
  const markers = await page.evaluate(() => window.vetkaPlayerLab?.markers() ?? []);
  expect(markers.length).toBeGreaterThan(before);
  await expect(page.getByTestId("marker-hint-toast")).toHaveCount(0);
});

test("оверлей поднимается над видимым транспортом (tb_1791172090_2308_6 п.2)", async ({ page }) => {
  await openVideo(page);
  await page.evaluate((srt) => window.vetkaPlayerLab?.importSubtitlesText(srt), PLAIN_SRT);
  await seek(page, 1.5);
  const overlay = page.getByTestId("subtitle-overlay");
  await expect(overlay).toContainText("Hello track");
  // Дождаться подъёма (замер бара асинхронен), затем мерить геометрию.
  await page.waitForFunction(() => {
    const ov = document.querySelector('[data-testid="subtitle-overlay"]');
    return (ov?.getAttribute("style") ?? "").includes("calc");
  });
  // Транспорт в оконном режиме виден — низ оверлея обязан быть
  // выше верха бара (а не под ним, как было при bottom 8%).
  const overlayBox = await overlay.boundingBox();
  const barBox = await page.locator(".transport-bar").boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  expect((overlayBox?.y ?? 0) + (overlayBox?.height ?? 0)).toBeLessThanOrEqual((barBox?.y ?? 0) + 1);
});
