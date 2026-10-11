import { expect, test } from "@playwright/test";

// tb_1791563210_29299_4: панель подхватывает перечитанный плейлист без
// перезапуска (web: storage-мост между документами; Tauri: playlist:reload).
// Плюс: открытое видео не дописывается в плейлист-вопрос.
test.use({
  launchOptions: {
    args: ["--autoplay-policy=no-user-gesture-required"],
  },
});

const E2E_PORT = process.env.VETKA_E2E_PORT ?? "1424";
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
const FIXTURE_URL = `${BASE_URL}/e2e/fixtures/subs_5s.mp4`;
const PLAYLIST_KEY = "vetka_player_lab_playlist_v1";

function playlistWith(paths: string[]) {
  return {
    id: "e2e",
    name: "e2e",
    entries: paths.map((p) => ({ path: p, name: p, duration: 5, addedAt: new Date().toISOString() })),
    createdAt: new Date().toISOString(),
  };
}

test("панель показывает новые пути без перезапуска", async ({ page, context }) => {
  await context.addInitScript(
    ({ key, pl }: { key: string; pl: unknown }) => {
      window.localStorage.setItem(key, JSON.stringify(pl));
    },
    { key: PLAYLIST_KEY, pl: playlistWith(["/v/old.mp4"]) },
  );
  await page.goto(`${BASE_URL}/`);
  const panel = await context.newPage();
  await panel.goto(`${BASE_URL}/playlist.html`);
  await expect(panel.getByText("/v/old.mp4")).toBeVisible();

  // Главная сторона перечитала плейлист из файла (как handleOpenPlaylistFile):
  // панель в другом документе ловит storage и перерисовывается сама.
  await page.evaluate(
    ({ key, pl }: { key: string; pl: unknown }) => {
      window.localStorage.setItem(key, JSON.stringify(pl));
    },
    { key: PLAYLIST_KEY, pl: playlistWith(["/v/new.mp4"]) },
  );
  await expect(panel.getByText("/v/new.mp4")).toBeVisible({ timeout: 5000 });
  await expect(panel.getByText("/v/old.mp4")).toHaveCount(0);
});

test("открытие записи не дописывает файл в плейлист-вопрос", async ({ page, context }) => {
  await context.addInitScript(
    ({ key, url }: { key: string; url: string }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          id: "q",
          name: "q",
          schema: "vetka.cut.question_playlist/1",
          entries: [
            { path: url, name: "s", duration: 5, addedAt: new Date().toISOString(), question_id: "q1", in_sec: 1, out_sec: 3 },
          ],
          createdAt: new Date().toISOString(),
        }),
      );
    },
    { key: PLAYLIST_KEY, url: FIXTURE_URL },
  );
  await page.goto(`${BASE_URL}/`);
  const panel = await context.newPage();
  await panel.goto(`${BASE_URL}/playlist.html`);
  await panel.getByText("s", { exact: true }).click();
  await expect(page.locator("video")).toHaveCount(1, { timeout: 15000 });
  const entries = await page.evaluate((key: string) => {
    return (JSON.parse(window.localStorage.getItem(key) || "{}").entries ?? []).length;
  }, PLAYLIST_KEY);
  expect(entries).toBe(1);
});
