// tb_1793558199_43420_2: карточка вопроса — один ряд ответов. Варианты choices
// сами и есть кнопки ответа (клик = verdict + choice), без choices — три
// кнопки Confirm / Reject / Not sure. Живой повод: оператор 01.11 забывал
// нажимать «и там, и там»; чип choices ничего не писал, писал только нижний ряд.
import { describe, expect, it } from "vitest";
// @ts-ignore: @types/node в проекте нет, рантайм vitest — node (как в scaleSizes.test.ts).
import { readFileSync } from "node:fs";
// @ts-ignore: см. выше.
import { join } from "node:path";
import appSrc from "../App.tsx?raw";
import { answerButtonsFor } from "./questionCardButtons";
import { formatAnswerReplyText } from "./questionPlaylist";

declare const __dirname: string;

// CSS читаем файлом: `?raw` на .css vite отдаёт пустым (стили он обрабатывает сам).
const cssSrc = readFileSync(join(__dirname, "..", "index.css"), "utf8");

describe("answerButtonsFor: вопрос без choices — три кнопки как раньше", () => {
  const three = [
    { label: "Confirm", verdict: "favorite", testId: "question-answer-favorite" },
    { label: "Reject", verdict: "negative", testId: "question-answer-negative" },
    { label: "Not sure", verdict: "comment", testId: "question-answer-comment" },
  ];

  it.each([
    ["undefined", undefined],
    ["пустой массив", []],
    ["только пустые и пробельные строки", ["", "   "]],
  ])("%s → Confirm / Reject / Not sure", (_name, choices) => {
    const buttons = answerButtonsFor(choices as readonly string[] | undefined);
    expect(buttons.map(({ label, verdict, testId }) => ({ label, verdict, testId }))).toEqual(three);
    for (const b of buttons) expect(b.choice).toBeUndefined();
  });

  it("не-массив из чужого плейлиста не роняет карточку", () => {
    expect(answerButtonsFor("pan" as unknown as readonly string[]).map((b) => b.testId)).toEqual(
      three.map((b) => b.testId),
    );
  });
});

describe("answerButtonsFor: да/нет-вопрос (confirm / reject / not_sure)", () => {
  const buttons = answerButtonsFor(["confirm", "reject", "not_sure"]);

  it("по кнопке на вариант, подписи по-человечески", () => {
    expect(buttons.map((b) => b.label)).toEqual(["Confirm", "Reject", "Not sure"]);
  });

  it("verdict: confirm → favorite, reject → negative, not_sure → comment", () => {
    expect(buttons.map((b) => b.verdict)).toEqual(["favorite", "negative", "comment"]);
  });

  it("choice пишется всегда — как есть, не подпись", () => {
    expect(buttons.map((b) => b.choice)).toEqual(["confirm", "reject", "not_sure"]);
  });

  it("отдельного ряда question-answer-* нет: тест-id у кнопок вариантов", () => {
    expect(buttons).toHaveLength(3);
    expect(buttons.every((b) => b.testId === "question-choice")).toBe(true);
  });
});

describe("answerButtonsFor: «Кто это?» (master / model / other / student / not_sure)", () => {
  const buttons = answerButtonsFor(["master", "model", "other", "student", "not_sure"]);

  it("любой вариант-содержание = favorite («ответ дан»), подпись как есть", () => {
    const named = buttons.filter((b) => b.choice !== "not_sure");
    expect(named.map((b) => b.label)).toEqual(["master", "model", "other", "student"]);
    expect(named.every((b) => b.verdict === "favorite")).toBe(true);
  });

  it("not_sure остаётся «не уверен»: comment + подпись Not sure", () => {
    const unsure = buttons.find((b) => b.choice === "not_sure");
    expect(unsure).toMatchObject({ label: "Not sure", verdict: "comment" });
  });

  it("choice каждой кнопки = исходный вариант", () => {
    expect(buttons.map((b) => b.choice)).toEqual(["master", "model", "other", "student", "not_sure"]);
  });

  it("клик по model даёт тот же reply-маркер, что и прежняя пара «чип + Confirm»", () => {
    const model = buttons.find((b) => b.choice === "model")!;
    expect(formatAnswerReplyText({ verdict: model.verdict, choice: model.choice })).toBe("[answer] model (favorite)");
  });
});

describe("answerButtonsFor: чистка вариантов", () => {
  it("пустые, не-строки и дубли отбрасываются, порядок сохраняется", () => {
    const buttons = answerButtonsFor(["pan", "", "  ", 7, null, "pan", "truck", " dolly "] as unknown as string[]);
    expect(buttons.map((b) => b.choice)).toEqual(["pan", "truck", "dolly"]);
  });

  it("регистр и пробелы не мешают узнать confirm / reject / not_sure, choice остаётся исходным", () => {
    const [yes, no] = answerButtonsFor([" Confirm ", "REJECT"]);
    expect(yes).toMatchObject({ verdict: "favorite", label: "Confirm", choice: "Confirm" });
    expect(no).toMatchObject({ verdict: "negative", label: "Reject", choice: "REJECT" });
  });

  it("key уникален — пригоден для React", () => {
    const keys = answerButtonsFor(["a", "b", "c"]).map((b) => b.key);
    expect(new Set(keys).size).toBe(3);
  });
});

describe("проводка в App.tsx и стили", () => {
  it("карточка строит ряд из answerButtonsFor и передаёт choice в answerQuestion", () => {
    expect(appSrc).toContain("answerButtonsFor(");
    expect(appSrc).toMatch(/answerQuestion\(\s*\w+\.verdict\s*,\s*\w+\.choice\s*\)/);
    expect(appSrc).toMatch(/async function answerQuestion\(verdict: AnswerVerdict, choice\?: string\)/);
  });

  it("состояния questionChoice и тумблера чипа больше нет", () => {
    expect(appSrc).not.toContain("questionChoice");
    expect(appSrc).not.toContain("setQuestionChoice");
    expect(appSrc).not.toMatch(/aria-pressed=\{[^}]*[Cc]hoice/);
  });

  it("ряд ответов один: контейнер question-card-side-answers", () => {
    expect(appSrc.match(/question-card-side-answers/g)?.length).toBe(1);
  });

  it("гард «нет маркеров / вне скобок» гасит те же кнопки", () => {
    const row = appSrc.slice(appSrc.indexOf("question-card-side-answers"));
    const block = row.slice(0, row.indexOf("question-next-on-file"));
    expect(block).toContain("questionHasMarkers(activeQuestion?.question_id)");
    expect(block).toContain("answerOutside");
    expect(block).toContain("disabled=");
  });

  it("CSS: ряд переносится, текст вопроса — несколько строк, не ellipsis", () => {
    const answers = /\.question-card-side-answers\s*\{[^}]*\}/.exec(cssSrc)?.[0] ?? "";
    expect(answers).toMatch(/display:\s*flex/);
    expect(answers).toMatch(/flex-wrap:\s*wrap/);
    const text = /\.question-card-side-text\s*\{[^}]*\}/.exec(cssSrc)?.[0] ?? "";
    expect(text).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(text).toMatch(/white-space:\s*normal/);
  });
});
