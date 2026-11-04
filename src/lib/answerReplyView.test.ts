// tb_1793586334_43420_1: косметика окна Markers. Оператор 02.11: «в вариантах не
// было favorite, а все ответы-варианты в комментариях помечены как favorite».
// Причина: вариант (student / other …) уходит с verdict=favorite («ответ дан»),
// а нитка рисовала ★ вида и приписку «(favorite)». Формат ответа не трогаем —
// его читают агент и answers.json; меняется только то, что видит оператор.
import { describe, expect, it } from "vitest";
import { answerReplyView } from "./answerReplyView";

const WHO = ["master", "model", "student", "other", "not_sure"];

describe("answerReplyView: ответ-вариант не выглядит как Confirm", () => {
  it("только вариант: без ★ и без «(favorite)»", () => {
    expect(answerReplyView("[answer] student (favorite)", WHO)).toEqual({
      text: "[answer] student",
      showKindGlyph: false,
    });
  });

  it("вариант + комментарий: комментарий остаётся, вердикт-приписка уходит", () => {
    expect(answerReplyView("[answer] other: ассорти шума (favorite)", WHO)).toEqual({
      text: "[answer] other: ассорти шума",
      showKindGlyph: false,
    });
  });

  it("not_sure — это сам вердикт (кнопка Not sure): остаётся как есть", () => {
    expect(answerReplyView("[answer] not_sure (comment)", WHO)).toEqual({
      text: "[answer] not_sure (comment)",
      showKindGlyph: true,
    });
  });

  it("варианты confirm / reject — вердикты да/нет-вопроса: ★/✕ законны", () => {
    const yn = ["confirm", "reject", "not_sure"];
    expect(answerReplyView("[answer] confirm (favorite)", yn).showKindGlyph).toBe(true);
    expect(answerReplyView("[answer] reject (negative)", yn).showKindGlyph).toBe(true);
  });

  it("вариант с вердиктом negative (старый двухрядный ответ) не стирается", () => {
    expect(answerReplyView("[answer] student (negative)", WHO)).toEqual({
      text: "[answer] student (negative)",
      showKindGlyph: true,
    });
  });

  it("Confirm с комментарием без варианта: ★ и приписка на месте", () => {
    expect(answerReplyView("[answer] сошлось (favorite)", WHO)).toEqual({
      text: "[answer] сошлось (favorite)",
      showKindGlyph: true,
    });
  });

  it("двоеточие в комментарии не делает его вариантом: решает список вариантов вопроса", () => {
    expect(answerReplyView("[answer] see: here (favorite)", ["a", "b"])).toEqual({
      text: "[answer] see: here (favorite)",
      showKindGlyph: true,
    });
  });

  it("вариантов вопроса не знаем (нет плейлиста): ничего не трогаем", () => {
    expect(answerReplyView("[answer] student (favorite)", undefined).showKindGlyph).toBe(true);
    expect(answerReplyView("[answer] student (favorite)", []).showKindGlyph).toBe(true);
    expect(answerReplyView("[answer] student (favorite)", null).text).toBe("[answer] student (favorite)");
  });

  it("не ответ карточки (обычный комментарий или reply человека): как есть", () => {
    expect(answerReplyView("просто ответ", WHO)).toEqual({ text: "просто ответ", showKindGlyph: true });
    expect(answerReplyView("", WHO)).toEqual({ text: "", showKindGlyph: true });
  });
});
