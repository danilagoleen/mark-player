import { expect, test } from "@playwright/test";

// tb_1791233039_7043_3: клик по пункту плейлиста → открывается и играет.
// Два окна одного контекста (один origin): панель пишет LS-мост
// vetka_player_lab_play_request_v1, главное окно ловит storage и открывает
// с autoplay-флагом. Chromium без жеста play() режектит — спеке разрешён
// автоплей флагом (поведение кода от флага не зависит).
test.use({
  launchOptions: {
    args: ["--autoplay-policy=no-user-gesture-required"],
  },
});

const FIXTURE_URL = "http://127.0.0.1:1424/e2e/fixtures/subs_5s.mp4";

async function seedPlaylist(context) {
  await context.addInitScript((url: string) => {
    const playlist = {
      id: "e2e",
      name: "e2e",
      entries: [{ path: url, name: "subs_5s.mp4", duration: 5, addedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(playlist));
  }, FIXTURE_URL);
}

test("клик по пункту плейлиста открывает видео и оно играет", async ({ page, context }) => {
  await seedPlaylist(context);
  await page.goto("/");
  // Пустое окно: видео ещё нет.
  await expect(page.locator("video")).toHaveCount(0);

  const panel = await context.newPage();
  await panel.goto("/playlist.html");
  await panel.getByText("subs_5s.mp4").click();

  // Главное окно: src сменился (fetch → blob) и пошло воспроизведение.
  const video = page.locator("video");
  await expect(video).toHaveCount(1, { timeout: 15000 });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.src.startsWith("blob:") && !v.paused;
  }, { timeout: 15000 });
  const t0 = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.waitForTimeout(600);
  const t1 = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t1).toBeGreaterThan(t0);
});

// tb_1792972841_45227_2: Repeat: one на плейлисте из ОДНОЙ записи вставал
// после первого проигрывания (оператор: аудио — нет, видео — да). Записи
// немного, поэтому loop one идёт ветвью «тот же путь» (без перезагрузки src):
// перезапуск обязан дождаться сика и снова играть. Аудио — как у оператора.
test("Repeat: one перезапускает единственную аудиозапись после конца", async ({ page, context }) => {
  await context.addInitScript(() => {
    const playlist = {
      id: "e2e-loop-one",
      name: "e2e-loop-one",
      entries: [{
        path: "http://127.0.0.1:1424/e2e/fixtures/tone_3s.wav",
        name: "tone_3s.wav",
        duration: 3,
        addedAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem("vetka_player_lab_playlist_v1", JSON.stringify(playlist));
    window.localStorage.setItem(
      "vetka_player_lab_playlist_mode_v1",
      JSON.stringify({ shuffle: false, loop: "one" }),
    );
  });
  await page.goto("/");

  const panel = await context.newPage();
  await panel.goto("/playlist.html");
  await panel.getByText("tone_3s.wav").click();

  const video = page.locator("video");
  await expect(video).toHaveCount(1, { timeout: 15000 });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.src.startsWith("blob:") && !v.paused;
  }, { timeout: 15000 });

  // tone_3s.wav — 3 секунды: к этому моменту первый оборот закончился.
  await page.waitForTimeout(4200);
  const after = await video.evaluate((v: HTMLVideoElement) => ({ t: v.currentTime, paused: v.paused }));
  expect(after.paused, "петля встала после первого проигрывания").toBe(false);
  expect(after.t, "петля не вернулась к началу").toBeLessThan(2.8);
});
