// tb_1793586334_43420_1: «Send to agent» терял набранный комментарий.
// Живой повод (оператор 02.11, плейлист queue_beta-who-big55-20261102-r2, 44 слайда):
// в answers.json 28 вопросов с выбором, 16 — без единой записи. В «намешанных»
// случаях ни один вариант не подходил; оператор печатал комментарий и жал
// «Send to agent», считая её сохранением. Кнопка только копировала УЖЕ готовый
// answers.json в ack/ и не читала поле Comment; при смене слайда поле очищалось.
import { describe, expect, it } from "vitest";
import appSrc from "../App.tsx?raw";
import { planSendToAgent } from "./sendToAgentPlan";

const base = { comment: "", hasPlaylistPath: true, hasAnswersDoc: true, hasActiveQuestion: true };

describe("planSendToAgent: что делает кнопка «Send to agent»", () => {
  it("текст в поле Comment: сначала сохранить его ответом, потом слать ack", () => {
    const plan = planSendToAgent({ ...base, comment: "ни один вариант не подходит" });
    expect(plan).toEqual({ action: "save_comment_then_ack", comment: "ни один вариант не подходит" });
  });

  it("пробелы вокруг текста срезаются; одни пробелы — это пустое поле", () => {
    expect(planSendToAgent({ ...base, comment: "  двое в кадре \n" })).toEqual({
      action: "save_comment_then_ack",
      comment: "двое в кадре",
    });
    expect(planSendToAgent({ ...base, comment: "   \n " })).toEqual({ action: "ack" });
  });

  it("пустое поле и ответы есть: прежнее поведение, только ack", () => {
    expect(planSendToAgent(base)).toEqual({ action: "ack" });
  });

  it("пустое поле и ответов нет: отказ no_answers (слать агенту нечего)", () => {
    expect(planSendToAgent({ ...base, hasAnswersDoc: false })).toEqual({ action: "refuse", reason: "no_answers" });
  });

  it("комментарий есть, а ответов ещё нет: не отказывать «answer first», а сохранять", () => {
    const plan = planSendToAgent({ ...base, comment: "первый слайд, сразу вопрос", hasAnswersDoc: false });
    expect(plan.action).toBe("save_comment_then_ack");
  });

  it("плейлиста с путём нет: отказ no_playlist даже с комментарием — текст остаётся в поле", () => {
    expect(planSendToAgent({ ...base, comment: "важно", hasPlaylistPath: false })).toEqual({
      action: "refuse",
      reason: "no_playlist",
    });
  });

  it("активного вопроса нет: сохранять комментарий не к чему, уходит только ack", () => {
    expect(planSendToAgent({ ...base, comment: "важно", hasActiveQuestion: false })).toEqual({ action: "ack" });
    expect(planSendToAgent({ ...base, comment: "важно", hasActiveQuestion: false, hasAnswersDoc: false })).toEqual({
      action: "refuse",
      reason: "no_answers",
    });
  });
});

describe("проводка в App.tsx: сохранение до ack, тишины нет", () => {
  const start = appSrc.indexOf("async function sendAnswersToAgent(");
  const end = appSrc.indexOf("async function refreshAnswersProgress(");
  const body = start >= 0 && end > start ? appSrc.slice(start, end) : "";

  it("sendAnswersToAgent найдена и строит план через planSendToAgent", () => {
    expect(body).not.toBe("");
    expect(body).toContain("planSendToAgent(");
  });

  it("комментарий сохраняется через answerQuestion(\"comment\") РАНЬШЕ записи ack", () => {
    const save = body.indexOf('answerQuestion("comment")');
    const ack = body.indexOf("writeAnswersAckFile(");
    expect(save).toBeGreaterThan(-1);
    expect(ack).toBeGreaterThan(save);
  });

  it("answerQuestion сообщает исход, а не молчит", () => {
    expect(appSrc).toContain("async function answerQuestion(verdict: AnswerVerdict, choice?: string): Promise<AnswerOutcome>");
  });

  it("неудачное сохранение комментария ack не шлёт и не прячется: ветка по исходу есть до ack", () => {
    const outcome = body.indexOf('outcome !== "saved"');
    const ack = body.indexOf("writeAnswersAckFile(");
    expect(outcome).toBeGreaterThan(-1);
    expect(outcome).toBeLessThan(ack);
  });

  it("тост называет и сохранение комментария, и отправку", () => {
    expect(body).toContain("Comment saved");
  });

  it("подсказка кнопки говорит о комментарии, а не только о копировании answers.json", () => {
    const btn = appSrc.slice(appSrc.indexOf('data-testid="question-send-agent"'));
    expect(btn.slice(0, 600).toLowerCase()).toContain("comment");
  });
});
