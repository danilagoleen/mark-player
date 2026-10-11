import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791146301_70644_18: Comments показывает все виды + хрон in-out + прыжок.
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

async function openComments(context, page) {
  const fileName = await page.evaluate(() => window.vetkaPlayerLab?.getFileName());
  const panel = await context.newPage();
  await panel.goto(`/comments.html?media=${encodeURIComponent(fileName ?? "")}&fps=30`);
  return panel;
}

test("все виды видны, у пары in-out хрон", async ({ page, context }) => {
  await openVideo(page);
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("favorite", ""));
  await seek(page, 2);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("comment", "hello"));
  await seek(page, 3);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("in", ""));
  await seek(page, 4);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("out", ""));

  const panel = await openComments(context, page);
  const rows = panel.getByTestId("comment-row");
  await expect(rows).toHaveCount(4);
  // Хрон пары 3→4 ≈ 1с (допуск seek ±0.35 → 00|01) — на ОБЕИХ строках пары.
  await expect(panel.getByText(/sel 00:00:0[01]:\d{2}/)).toHaveCount(2);
  await panel.close();
});

test("клик по строке прыгает плейхед, правка текстов жива", async ({ page, context }) => {
  await openVideo(page);
  await seek(page, 3);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("favorite", ""));
  await seek(page, 1);
  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("comment", "editable"));
  await seek(page, 0.5);

  const panel = await openComments(context, page);
  const rows = panel.getByTestId("comment-row");
  await expect(rows).toHaveCount(2);
  // Строки по времени: [comment@1, fav@3] — прыгаем по второй.
  await rows.nth(1).click();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video !== null && Math.abs(video.currentTime - 3) < 0.5;
  });
  // Edit текстового не сломан.
  await panel.getByRole("button", { name: "Edit comment" }).first().click();
  await panel.locator("textarea").fill("edited");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("edited")).toBeVisible();
  await panel.close();
});
