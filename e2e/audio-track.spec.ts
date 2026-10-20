import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Chromium без жеста режектит play(); спеке разрешён автоплей флагом.
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

// tb_1791571305_29299_2: аудиофайл (wav-сниппет заминок) открывается тем же
// <video>, что и видео: шкала, плейхед, транспорт и маркеры обязаны быть.
const AUDIO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/tone_3s.wav",
);
const VIDEO_FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/subs_5s.mp4",
);

async function openAudio(page) {
  await page.goto("/");
  await page.locator('input[accept*="video/*"]').setInputFiles(AUDIO_FIXTURE);
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video !== null && Number.isFinite(video.duration) && video.duration > 2.5;
  });
}

test("аудио: плашка, шкала, плейхед и транспорт — как у видео [signal: audio-track] [project: cut-player]", async ({ page }) => {
  await openAudio(page);

  await expect(page.getByTestId("audio-stage")).toBeVisible();
  const clefs = page.getByTestId("audio-stage-clefs");
  await expect(clefs).toBeVisible();
  await expect(clefs).toHaveText("𝄞");
  await expect(clefs.locator(".audio-stage-clef-bass")).toHaveCount(0);
  await expect(clefs).toHaveCSS("color", "rgb(232, 234, 237)");
  await expect(page.getByTestId("transport-play-pause")).toBeVisible();
  await expect(page.getByTestId("transport-progress")).toBeVisible();
  await expect(page.locator(".time-ruler-tick-major").first()).toBeVisible();
  await expect(page.locator(".transport-playhead")).toHaveCount(1);

  // Длительность аудио честно живёт в транспорте.
  await expect(page.locator(".transport-bar")).toContainText(/00:00:03:\d{2}/);

  // tb_1792435439_49541_1: нижняя полоса с probe-offline у аудио не нужна.
  await expect(page.locator(".player-footer")).toHaveCount(0);
  await expect(page.getByTestId("probe-offline-badge")).toHaveCount(0);
});

test("аудио: маркер ставится и виден на шкале [signal: audio-track] [project: cut-player]", async ({ page }) => {
  await openAudio(page);

  await page.evaluate(() => window.vetkaPlayerLab?.addMomentMarker("favorite", ""));
  await expect(page.locator(".marker-lane .transport-marker")).toHaveCount(1);
});

// tb_1792439791_49541_5: ручной перенос плейхеда за скобки вопроса во время
// play раньше откатывался к IN (выглядело как «прыгнул назад и остановился»).
// Теперь намерение оператора сильнее снапа: плейхед остаётся, play идёт.
test("аудио: плейхед, брошенный до IN во время проигрывания, не откатывается [signal: audio-track] [project: cut-player]", async ({ page, context }) => {
  await page.goto("/");
  const audioUrl = new URL("/e2e/fixtures/tone_3s.wav", page.url()).toString();
  await page.evaluate((url) => {
    const playlist = {
      id: "e2e-audio-question",
      name: "e2e-audio-question",
      entries: [{
        path: url,
        name: "tone_3s.wav",
        duration: 3,
        question_id: "q-audio-drag",
        question: "Audio drag?",
        in_sec: 2.0,
        out_sec: 2.5,
        addedAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(playlist));
  }, audioUrl);
  await page.reload();

  const panel = await context.newPage();
  await panel.goto("/playlist.html");
  await panel.getByText("tone_3s.wav").first().click();

  const video = page.locator("video");
  await expect(video).toHaveCount(1, { timeout: 15000 });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && Number.isFinite(v.duration) && v.duration > 2.5 && !v.paused;
  }, { timeout: 15000 });
  await page.evaluate(() => {
    const v = document.querySelector("video") as HTMLVideoElement;
    v.currentTime = 2.2;
  });
  await page.waitForTimeout(300);

  const wrap = page.locator(".transport-progress-wrap");
  const box = await wrap.boundingBox();
  if (!box) throw new Error("no transport box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.75, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, y, { steps: 8 });
  await page.mouse.up();

  await page.waitForTimeout(300);
  const dropped = await video.evaluate((v) => ({ t: v.currentTime, paused: v.paused }));
  expect(dropped.paused).toBe(false);
  expect(dropped.t).toBeLessThan(1.5);

  // Дольше 800-мс окна ножниц: снап не должен включиться и после паузы.
  await page.waitForTimeout(700);
  const later = await video.evaluate((v) => ({ t: v.currentTime, paused: v.paused }));
  expect(later.paused).toBe(false);
  expect(later.t).toBeGreaterThan(dropped.t);
  expect(later.t).toBeLessThan(2.0);
});

// tb_1792441299_49541_7 + tb_1792443862_5828_1: во время протяжки на аудио
// плейхед идёт за курсором, но currentTime не трогается вовсе (иначе WebKit
// заново праймит аудио-пайплайн); единственный seek — на отпускании.
test("аудио: протяжка во время play ведёт плейхед за курсором, один seek на отпускании [signal: audio-track] [project: cut-player]", async ({ page }) => {
  await openAudio(page);

  const video = page.locator("video");
  await video.evaluate((v) => v.play());
  await page.waitForFunction(() => {
    const v = document.querySelector("video") as HTMLVideoElement | null;
    return v !== null && !v.paused;
  });

  const wrap = page.locator(".transport-progress-wrap");
  const box = await wrap.boundingBox();
  if (!box) throw new Error("no transport box");
  const y = box.y + box.height / 2;
  const fromX = box.x + box.width * 0.15;
  const toX = box.x + box.width * 0.75;
  const playhead = page.locator(".transport-playhead");
  const leftPercent = async (): Promise<number> =>
    playhead.evaluate((el) => Number.parseFloat((el as HTMLElement).style.left));

  await page.mouse.move(fromX, y);
  const dragStart = await video.evaluate((v) => ({ t: v.currentTime, w: performance.now() }));
  await page.mouse.down();
  const percents: number[] = [];
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / 10, y);
    await page.waitForTimeout(40);
    percents.push(await leftPercent());
    const sample = await video.evaluate((v) => ({ t: v.currentTime, w: performance.now() }));
    const elapsed = (sample.w - dragStart.w) / 1000;
    // currentTime растёт только естественным play — не прыгает к курсору.
    expect(sample.t - dragStart.t).toBeLessThanOrEqual(elapsed + 0.5);
  }

  // Пока кнопка зажата, плейхед не откатывается назад ни на шаг.
  for (let i = 1; i < percents.length; i += 1) {
    expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1] - 0.5);
  }
  expect(percents[percents.length - 1]).toBeGreaterThan(55);

  // Один финальный seek на отпускании доводит факт до точки броска (75%).
  await page.evaluate(() => {
    (window as any).__seekedAt = null;
    document.querySelector("video")?.addEventListener(
      "seeked",
      (event) => {
        (window as any).__seekedAt = (event.target as HTMLVideoElement).currentTime;
      },
      { once: true },
    );
  });
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__seekedAt !== null, { timeout: 3000 });
  const seekedAt = await page.evaluate(() => (window as any).__seekedAt as number);
  expect(seekedAt).toBeGreaterThan(2.15);
  expect(seekedAt).toBeLessThan(2.45);

  const after = await video.evaluate((v) => ({
    paused: v.paused,
    muted: v.muted,
    volume: v.volume,
  }));
  expect(after.paused).toBe(false);
  expect(after.muted).toBe(false);
  expect(after.volume).toBeGreaterThan(0);
  await expect(playhead).toHaveCount(1);
});

// tb_1792440665_49541_6: знак аудио-сцены не протекает в видео-режим.
test("видео: ключи аудио-сцены не показываются [signal: audio-track] [project: cut-player]", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[accept*="video/*"]').setInputFiles(VIDEO_FIXTURE);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.getByTestId("audio-stage")).toHaveCount(0);
  await expect(page.getByTestId("audio-stage-clefs")).toHaveCount(0);
});
