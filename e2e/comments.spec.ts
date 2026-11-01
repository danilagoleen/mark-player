import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tb_1793125816_99982_1: M-спека играет видео; Chromium без жеста play()
// режектит — автоплей разрешён флагом (код от флага не зависит).
test.use({
  launchOptions: {
    args: ["--autoplay-policy=no-user-gesture-required"],
  },
});

// tb_1791146301_70644_18: Comments показывает все виды + хрон in-out + прыжок.
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
  // Edit текстового не сломан: поле правки живёт В строке (сверху — поле
  // нового комментария с тем же тегом textarea). Первая строка — comment@1.
  const editableRow = rows.nth(0);
  await panel.getByRole("button", { name: "Edit comment" }).first().click();
  await editableRow.locator("textarea").fill("edited");
  await editableRow.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("edited")).toBeVisible();
  await panel.close();
});

// tb_1793125816_99982_1: M — точка разговора: пауза + живой якорь.
// f/n/i/o намеренно НЕ ставят паузу — они ложатся по ходу просмотра.
test.describe("M — пауза и живой якорь", () => {
  test("M ставит паузу, f/n/i/o — нет, якорь уезжает в localStorage", async ({ page }) => {
    await openVideo(page);
    await seek(page, 1);
    await page.evaluate(() => { void document.querySelector("video")?.play(); });
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video !== null && !video.paused;
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    for (const key of ["f", "n", "i", "o"]) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => Boolean(document.querySelector("video")?.paused))).toBe(false);
    }

    await page.keyboard.press("m");
    await page.waitForFunction(() => Boolean(document.querySelector("video")?.paused));

    const media = await page.evaluate(() => window.vetkaPlayerLab?.getFileName());
    const anchor = await page.evaluate(() => {
      const raw = window.localStorage.getItem("vetka_player_lab_comment_anchor_v1");
      return raw ? JSON.parse(raw) as { media: string; sec: number } : null;
    });
    const playedTo = await page.evaluate(() => Number(document.querySelector("video")?.currentTime ?? 0));
    expect(anchor?.media).toBe(media);
    expect(Math.abs(Number(anchor?.sec) - playedTo)).toBeLessThan(0.5);
  });

  test("M, play, пауза, Save — якорь второго таймкода, не первого", async ({ page, context }) => {
    await openVideo(page);
    await seek(page, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("m");
    await page.waitForFunction(() => Boolean(document.querySelector("video")?.paused));
    const firstAt = await page.evaluate(() => Number(document.querySelector("video")?.currentTime ?? 0));
    const media = await page.evaluate(() => window.vetkaPlayerLab?.getFileName());

    // Оператор смотрит дальше — второй таймкод далеко от первого.
    await page.evaluate(() => { void document.querySelector("video")?.play(); });
    await page.waitForFunction((since) => Number(document.querySelector("video")?.currentTime ?? 0) > since + 1.5, firstAt);
    await page.evaluate(() => document.querySelector("video")?.pause());
    await page.waitForFunction(() => Boolean(document.querySelector("video")?.paused));
    const secondAt = await page.evaluate(() => Number(document.querySelector("video")?.currentTime ?? 0));

    const panel = await context.newPage();
    await panel.goto(`/comments.html?media=${encodeURIComponent(media ?? "")}&fps=30&at=${firstAt.toFixed(2)}&filter=comments`);
    await panel.getByTestId("comment-new-input").fill("live anchor");
    await panel.getByTestId("comment-new-save").click();
    await expect(panel.getByTestId("comment-row")).toHaveCount(1);

    const marker = await panel.evaluate(() => {
      const raw = window.localStorage.getItem("vetka_player_lab_markers_v1");
      const rows = raw ? JSON.parse(raw) as Array<{ text?: string; anchor_sec?: number }> : [];
      return rows.find((row) => row.text === "live anchor") ?? null;
    });
    expect(marker?.anchor_sec).toBeGreaterThan(secondAt - 0.35);
    expect(marker?.anchor_sec).toBeLessThan(secondAt + 0.35);
    await panel.close();
  });
});
