import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791146301_70644_17: окно всех маркеров — список, фильтр, прыжок.
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

async function openPanel(context, page) {
  const fileName = await page.evaluate(() => window.vetkaPlayerLab?.getFileName());
  const panel = await context.newPage();
  await panel.goto(`/markers.html?media=${encodeURIComponent(fileName ?? "")}`);
  return panel;
}

test("панель lists all kinds without text markers", async ({ page, context }) => {
  await openVideo(page);
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("favorite", ""));
  await seek(page, 2);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("comment", "hello"));
  await seek(page, 3);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("in", ""));

  const panel = await openPanel(context, page);
  await expect(panel.getByTestId("markers-panel")).toBeVisible();
  await expect(panel.getByTestId("marker-row")).toHaveCount(3);
  await expect(panel.getByTestId("markers-count")).toContainText("3");
  await panel.close();
});

test("фильтр по видам режет список", async ({ page, context }) => {
  await openVideo(page);
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("favorite", ""));
  await seek(page, 2);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("comment", "hello"));

  const panel = await openPanel(context, page);
  await expect(panel.getByTestId("marker-row")).toHaveCount(2);
  await panel.getByTestId("markers-filter-favorite").click();
  await expect(panel.getByTestId("marker-row")).toHaveCount(1);
  await panel.getByTestId("markers-filter-comment").click();
  await expect(panel.getByTestId("marker-row")).toHaveCount(1);
  await panel.getByTestId("markers-filter-all").click();
  await expect(panel.getByTestId("marker-row")).toHaveCount(2);
  await panel.close();
});

test("клик по строке прыгает плейхед в главном окне", async ({ page, context }) => {
  await openVideo(page);
  await seek(page, 3);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("favorite", ""));
  await seek(page, 0.5);

  const panel = await openPanel(context, page);
  await panel.getByTestId("marker-row").first().click();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video !== null && Math.abs(video.currentTime - 3) < 0.5;
  });
  await panel.close();
});

test("честная заглушка VETKA-тоста", async ({ page }) => {
  await openVideo(page);
  await page.getByTestId("context-action").click();
  await expect(page.getByTestId("vetka-promo-toast")).toContainText(
    "VETKA — Visual Enhanced Tree Knowledge Architecture — coming soon, read the About",
  );
});

test("tb_1791346279_38729_3: окно показывает хрон пар и итог", async ({ page, context }) => {
  await openVideo(page);
  await page.evaluate(() => document.querySelector("video")?.pause());
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("in", ""));
  await seek(page, 3);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("out", ""));

  const panel = await openPanel(context, page);
  await expect(panel.getByTestId("markers-inout-total")).toContainText("sel 00:00:02:00");
  await expect(panel.getByTestId("marker-row-span")).toHaveCount(2);
  await panel.close();
});
