import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1791333803_37784_1: превью монтажного листа одного видео (1.0 п.4.5).
const VIDEO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/subs_5s.mp4",
);
const TICKS = 254016000000;

function sheetText(rows: { id: string; media: string; src_in: number; src_out: number }[], media: Record<string, { path: string }>, title = "test sheet") {
  return JSON.stringify({
    schema: "vetka.cut.sheet/1",
    id: "sheet_e2e",
    title,
    rev: 1,
    tick_rate: TICKS,
    media,
    rows: rows.map((r, i) => ({ ...r, n: i + 1 })),
  });
}

const SINGLE_SHEET = sheetText(
  [
    { id: "r1", media: "M1", src_in: TICKS * 1, src_out: TICKS * 2 },
    { id: "r2", media: "M1", src_in: TICKS * 3, src_out: TICKS * 4 },
  ],
  { M1: { path: "subs_5s.mp4" } },
);

async function openVideo(page) {
  await page.goto("/");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles(VIDEO_FIXTURE);
  await page.waitForFunction(() => {
    const snapshot = window.vetkaPlayerLab?.snapshot();
    return Boolean(snapshot?.ok && snapshot.viewerWidth > 0 && snapshot.sourceKind === "video");
  });
  await page.evaluate(() => document.querySelector("video")?.pause());
}

async function openSheet(page, text: string) {
  return page.evaluate(
    ([t]) => window.vetkaPlayerLab?.openCutsheetText(t, "/fake/dir/sheet.cutsheet.json"),
    [text],
  );
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

test("лист одного видео: строки играют, внешнее пролетается без played-through", async ({ page }) => {
  await openVideo(page);
  const msg = await openSheet(page, SINGLE_SHEET);
  expect(msg).toMatch(/preview on/);
  await expect(page.getByTestId("cutsheet-preview-badge")).toBeVisible();
  await seek(page, 0.2);
  await ensurePlaying(page);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.currentTime >= 1.95;
  }, { timeout: 10000 });
  // Разрыв [2,3] пролетается: 1.95 → 2.95 быстрее секунды.
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.currentTime >= 2.95;
  }, { timeout: 2500 });
});

test("лист на два файла — тост про CUT Player, ничего не играет", async ({ page }) => {
  await openVideo(page);
  const msg = await openSheet(
    page,
    sheetText(
      [
        { id: "r1", media: "M1", src_in: TICKS, src_out: TICKS * 2 },
        { id: "r2", media: "M2", src_in: TICKS, src_out: TICKS * 2 },
      ],
      { M1: { path: "a.mp4" }, M2: { path: "b.mp4" } },
    ),
  );
  expect(msg).toMatch(/CUT Player/);
  await expect(page.getByTestId("cutsheet-preview-badge")).toHaveCount(0);
});

test("лист чужого видео — тост с обоими путями", async ({ page }) => {
  await openVideo(page);
  const msg = await openSheet(
    page,
    sheetText(
      [{ id: "r1", media: "M1", src_in: TICKS, src_out: TICKS * 2 }],
      { M1: { path: "/order/sd1/other.mp4" } },
    ),
  );
  expect(msg).toMatch(/other\.mp4/);
  expect(msg).toMatch(/subs_5s\.mp4/);
  await expect(page.getByTestId("cutsheet-preview-badge")).toHaveCount(0);
});
