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

type Q = { question_id: string; question: string; path: string; in_sec?: number; out_sec?: number; choices?: string[] };

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

async function replies(page: Page): Promise<{ reply_to: string; kind: string; text: string }[]> {
  return page.evaluate((key) => {
    const raw = JSON.parse(window.localStorage.getItem(key) || "[]") as { reply_to?: string; kind?: string; text?: string }[];
    return raw
      .filter((m) => typeof m.reply_to === "string" && m.reply_to)
      .map((m) => ({ reply_to: m.reply_to as string, kind: String(m.kind ?? ""), text: String(m.text ?? "") }));
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

// tb_1793558199_43420_2: один ряд ответов. У записи есть choices — кнопки это и
// есть варианты, ОДИН клик пишет ответ (verdict + choice); нижнего ряда
// Confirm / Reject / Not sure рядом нет.
test("«Кто это?»: один клик по варианту пишет ответ — favorite + choice, без второго ряда", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "who1", question: "Кто это?", path: IMAGE_URL, choices: ["master", "model", "other", "not_sure"] },
  ];
  await openFirstEntry(page, context, qs);
  await expect(page.locator("img.viewer-image")).toBeVisible();

  const choices = page.getByTestId("question-choice");
  await expect(choices).toHaveCount(4);
  await expect(choices.nth(0)).toHaveText("master");
  await expect(choices.nth(3)).toHaveText("Not sure");
  // второго ряда нет: ни одной из базовых кнопок
  await expect(page.getByTestId("question-answer-favorite")).toHaveCount(0);
  await expect(page.getByTestId("question-answer-negative")).toHaveCount(0);
  await expect(page.getByTestId("question-answer-comment")).toHaveCount(0);

  await page.locator('[data-testid="question-choice"][data-choice="model"]').click();
  await expect.poll(async () => (await replies(page)).length).toBe(1);
  const [reply] = await replies(page);
  expect(reply.reply_to).toBe("qmat_who1_whole");
  expect(reply.kind).toBe("favorite");
  expect(reply.text).toContain("model");
});

test("«Не уверен» среди вариантов пишет comment с choice=not_sure", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "who2", question: "Кто это?", path: IMAGE_URL, choices: ["master", "model", "other", "not_sure"] },
  ];
  await openFirstEntry(page, context, qs);
  await page.getByTestId("question-comment").fill("лицо не видно");
  await page.locator('[data-testid="question-choice"][data-choice="not_sure"]').click();
  await expect.poll(async () => (await replies(page)).length).toBe(1);
  const [reply] = await replies(page);
  expect(reply.kind).toBe("comment");
  expect(reply.text).toContain("not_sure");
  expect(reply.text).toContain("лицо не видно");
});

// tb_1793586334_43420_1: «Send to agent» жали как «сохранить комментарий», а она
// копировала готовый answers.json и теряла набранный текст (оператор 02.11,
// плейлист r2: 16 вопросов из 44 без записи). Теперь текст в поле — ответ comment.
test("«Send to agent» сохраняет набранный комментарий ответом comment, а не теряет его", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "who3", question: "Кто это?", path: IMAGE_URL, choices: ["master", "model", "other", "not_sure"] },
  ];
  await openFirstEntry(page, context, qs);
  await page.evaluate(() => window.localStorage.setItem("vetka_player_lab_question_playlist_path_v1", "/tmp/e2e.playlist.json"));
  const field = page.getByTestId("question-comment");
  await field.fill("ни один вариант не подходит, двое в кадре");
  await page.getByTestId("question-send-agent").click();
  await expect.poll(async () => (await replies(page)).length).toBe(1);
  const [reply] = await replies(page);
  expect(reply.reply_to).toBe("qmat_who3_whole");
  expect(reply.kind).toBe("comment");
  expect(reply.text).toContain("ни один вариант не подходит, двое в кадре");
  await expect(field).toHaveValue("");
});

test("«Send to agent» без пути плейлиста отказывает и оставляет текст в поле", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "who4", question: "Кто это?", path: IMAGE_URL, choices: ["master", "model", "other", "not_sure"] },
  ];
  await openFirstEntry(page, context, qs);
  const field = page.getByTestId("question-comment");
  await field.fill("не потеряй меня");
  await page.getByTestId("question-send-agent").click();
  await expect(field).toHaveValue("не потеряй меня");
  expect(await replies(page)).toHaveLength(0);
});

test("да/нет-вопрос с choices confirm/reject/not_sure: три кнопки вариантов, отдельного ряда question-answer-* нет", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "yn1", question: "Один ли человек?", path: IMAGE_URL, choices: ["confirm", "reject", "not_sure"] },
  ];
  await openFirstEntry(page, context, qs);
  await expect(page.getByTestId("question-choice")).toHaveText(["Confirm", "Reject", "Not sure"]);
  await expect(page.getByTestId("question-answer-favorite")).toHaveCount(0);

  await page.locator('[data-testid="question-choice"][data-choice="reject"]').click();
  await expect.poll(async () => (await replies(page)).length).toBe(1);
  const [reply] = await replies(page);
  expect(reply.reply_to).toBe("qmat_yn1_whole");
  expect(reply.kind).toBe("negative");
  // choice пишется и у да/нет-вопроса
  expect(reply.text).toContain("reject");
});

test("кнопки вариантов гаснут вне скобок так же, как базовые", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "qa", question: "Вопрос A", path: VIDEO_URL, in_sec: 0, out_sec: 1.5, choices: ["master", "model"] },
    { question_id: "qb", question: "Вопрос B", path: VIDEO_URL, in_sec: 1.5, out_sec: 3, choices: ["master", "model"] },
  ];
  await openFirstEntry(page, context, qs);
  await pauseAndSeek(page, 0.5);
  await expect(page.getByTestId("question-choice").first()).toBeEnabled();
  await pauseAndSeek(page, 4);
  await expect(page.getByTestId("question-outside")).toBeVisible();
  await expect(page.getByTestId("question-choice").first()).toBeDisabled();
  await expect(page.getByTestId("question-choice").nth(1)).toBeDisabled();
});

// tb_1793567711_43420_2: 0.26.7 теряла маркеры при открытии плейлиста (эхо
// markers:changed затирало их до записи в LS) — карточка гасла плашкой
// «Reimport the playlist». Теперь плеер сам материализует недостающее.
test("самоисцеление: плейлист есть, маркеров нет — карточка сама создаёт qmat-маркеры без переимпорта", async ({ page, context }) => {
  const qs: Q[] = [
    { question_id: "heal1", question: "Кто это?", path: IMAGE_URL, choices: ["person", "noise", "not_sure"] },
    { question_id: "heal2", question: "Кто это 2?", path: IMAGE_URL, choices: ["person", "noise", "not_sure"] },
  ];
  const { playlist } = seed(qs);
  await context.addInitScript(
    ({ pk, mk, pl }: { pk: string; mk: string; pl: unknown }) => {
      window.localStorage.setItem(pk, JSON.stringify(pl));
      window.localStorage.setItem(mk, JSON.stringify([]));
    },
    { pk: PLAYLIST_KEY, mk: MARKERS_KEY, pl: playlist },
  );
  await page.goto(`${BASE_URL}/`);
  const panel = await context.newPage();
  await panel.goto(`${BASE_URL}/playlist.html`);
  await panel.getByText(qs[0].question_id, { exact: true }).first().click();
  await expect(page.getByTestId("question-card")).toBeVisible({ timeout: 15000 });

  const ids = async () =>
    page.evaluate((key) => (JSON.parse(window.localStorage.getItem(key) || "[]") as { marker_id: string }[]).map((m) => m.marker_id), MARKERS_KEY);
  await expect.poll(async () => (await ids()).includes("qmat_heal1_whole"), { timeout: 15000 }).toBe(true);
  expect(await ids()).toContain("qmat_heal2_whole");
  // повторного лечения нет: каждый маркер ровно один
  const all = await ids();
  expect(all.filter((id) => id === "qmat_heal1_whole")).toHaveLength(1);
});
