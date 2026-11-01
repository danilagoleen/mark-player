import { expect, test, type Page } from "@playwright/test";
import { materializeQuestionEntry } from "../src/lib/questionMaterialize";

// tb_1793480340_10647_1: ответ карточки — только внутри скобок своего вопроса
// (живой прогон фото-капчи 31.10: ответы уезжали к чужим вопросам), карточка
// на картинке (запись без скобок), play после последнего OUT — плейлист заново.
test.use({
  launchOptions: {
    args: ["--autoplay-policy=no-user-gesture-required"],
  },
});

const E2E_PORT = process.env.VETKA_E2E_PORT ?? "1424";
const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
const VIDEO_URL = `${BASE_URL}/e2e/fixtures/subs_5s.mp4`;
const IMAGE_URL = `${BASE_URL}/e2e/fixtures/portrait.jpg`;
const PLAYLIST_KEY = "vetka_player_lab_playlist_v1";
const MARKERS_KEY = "vetka_player_lab_markers_v1";
const NOW = "2026-11-01T00:00:00.000Z";

type Q = { question_id: string; question: string; path: string; in_sec?: number; out_sec?: number };

function seed(entries: Q[]) {
  const playlist = {
    id: "e2e-binding",
    name: "e2e-binding",
    schema: "vetka.cut.question_playlist/1",
    entries: entries.map((e) => ({ ...e, name: e.question_id, duration: 5, addedAt: NOW })),
    createdAt: NOW,
  };
  // В web-режиме src — blob:, и ключ медиа маркера = имя файла (currentMediaKey).
  const markers = entries.flatMap((e) =>
    materializeQuestionEntry(e, { mediaPath: e.path.split("/").pop() ?? e.path, author: "agent:Beta", now: NOW }),
  );
  return { playlist, markers };
}

async function openFirstEntry(page: Page, context: import("@playwright/test").BrowserContext, entries: Q[]) {
  const { playlist, markers } = seed(entries);
  await context.addInitScript(
    ({ pk, mk, pl, ms }: { pk: string; mk: string; pl: unknown; ms: unknown }) => {
      window.localStorage.setItem(pk, JSON.stringify(pl));
      window.localStorage.setItem(mk, JSON.stringify(ms));
    },
    { pk: PLAYLIST_KEY, mk: MARKERS_KEY, pl: playlist, ms: markers },
  );
  await page.goto(`${BASE_URL}/`);
  const panel = await context.newPage();
  await panel.goto(`${BASE_URL}/playlist.html`);
  await panel.getByText(entries[0].question_id, { exact: true }).first().click();
  await expect(page.getByTestId("question-card")).toBeVisible({ timeout: 15000 });
}

async function pauseAndSeek(page: Page, t: number) {
  await page.evaluate((sec) => {
    const v = document.querySelector("video");
    if (!v) return;
    v.pause();
    v.currentTime = sec;
  }, t);
  await page.waitForFunction((sec) => {
    const v = document.querySelector("video");
    return v !== null && Math.abs(v.currentTime - sec) < 0.2;
  }, t);
}

async function replyTargets(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = JSON.parse(window.localStorage.getItem(key) || "[]") as { reply_to?: string }[];
    return raw.filter((m) => typeof m.reply_to === "string" && m.reply_to).map((m) => m.reply_to as string);
  }, MARKERS_KEY);
}

const VIDEO_QS: Q[] = [
  { question_id: "qa", question: "Вопрос A", path: VIDEO_URL, in_sec: 0, out_sec: 1.5 },
  { question_id: "qb", question: "Вопрос B", path: VIDEO_URL, in_sec: 1.5, out_sec: 3 },
];

test("кнопки карточки гаснут вне скобок; ответ уходит вопросу под плейхедом", async ({ page, context }) => {
  await openFirstEntry(page, context, VIDEO_QS);
  const confirm = page.getByTestId("question-answer-favorite");

  await pauseAndSeek(page, 0.5);
  await expect(page.getByTestId("question-text")).toHaveText("Вопрос A");
  await expect(confirm).toBeEnabled();

  // щель 3–5 с: вопроса нет — карточка держит последний, но отвечать нельзя
  await pauseAndSeek(page, 4);
  await expect(page.getByTestId("question-outside")).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(page.getByTestId("question-answer-negative")).toBeDisabled();
  await expect(page.getByTestId("question-answer-comment")).toBeDisabled();

  // плейхед вошёл в скобки B — карточка переключилась на B, ответ уходит B, не A
  await pauseAndSeek(page, 2.2);
  await expect(page.getByTestId("question-text")).toHaveText("Вопрос B");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(async () => replyTargets(page)).toEqual(["qmat_qb_in"]);
});

test("набранный комментарий не даёт ответить чужому вопросу: карточка A вне своих скобок погашена", async ({ page, context }) => {
  await openFirstEntry(page, context, VIDEO_QS);
  await pauseAndSeek(page, 0.5);
  await page.getByTestId("question-comment").fill("пока думаю");
  // плейхед уехал в скобки B, а ввод не очищен: карточка остаётся на A (ввод не теряем)…
  await pauseAndSeek(page, 2.2);
  await expect(page.getByTestId("question-text")).toHaveText("Вопрос A");
  // …но ответ на A с позиции B не принимается
  await expect(page.getByTestId("question-answer-favorite")).toBeDisabled();
  expect(await replyTargets(page)).toEqual([]);
});

test("play после паузы на OUT последней записи начинает плейлист заново, а не уходит в щель", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "qa", question: "Вопрос A", path: VIDEO_URL, in_sec: 0, out_sec: 1 },
    { question_id: "qb", question: "Вопрос B", path: VIDEO_URL, in_sec: 1, out_sec: 2 },
  ];
  await openFirstEntry(page, context, qs);
  await pauseAndSeek(page, 0.2);
  await page.evaluate(() => document.querySelector("video")?.play());
  // дошли до OUT последней записи (2 с): пауза ровно на скобке
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && v.paused && Math.abs(v.currentTime - 2) < 0.15;
  }, undefined, { timeout: 15000 });
  await page.getByTestId("transport-play-pause").click();
  // плейлист пошёл заново: первая запись, плейхед около её IN, видео играет
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v !== null && !v.paused && v.currentTime < 1.2;
  }, undefined, { timeout: 10000 });
  await expect(page.getByTestId("question-text")).toHaveText("Вопрос A");
});

test("картинка: запись без скобок отвечается карточкой, ответ крепится к _whole", async ({ page, context }) => {
  const qs: Q[] = [{ question_id: "img1", question: "Один ли человек?", path: IMAGE_URL }];
  await openFirstEntry(page, context, qs);
  await expect(page.locator("img.viewer-image")).toBeVisible();
  const confirm = page.getByTestId("question-answer-favorite");
  await expect(confirm).toBeEnabled();
  await expect(page.getByTestId("question-outside")).toHaveCount(0);
  await confirm.click();
  await expect.poll(async () => replyTargets(page)).toEqual(["qmat_img1_whole"]);
});
