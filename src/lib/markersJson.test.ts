import { describe, expect, it } from "vitest";
import { normalizeImportedMarker } from "./markersJson";

// tb_1791146800_70644_20: текст едет у маркера любого вида —
// round-trip JSON (экспорт полных объектов → импорт) обязан сохранять text на fav/neg.

describe("normalizeImportedMarker", () => {
  it("keeps kind + text for favorite/negative", () => {
    expect(normalizeImportedMarker({ kind: "favorite", text: "почему fav" })).toMatchObject({
      kind: "favorite",
      text: "почему fav",
    });
    expect(normalizeImportedMarker({ kind: "negative", text: "брак" })).toMatchObject({
      kind: "negative",
      text: "брак",
    });
  });

  it("falls back to label when text is missing, empty string when both missing", () => {
    expect(normalizeImportedMarker({ kind: "in", label: "точка" })?.text).toBe("точка");
    expect(normalizeImportedMarker({ kind: "out" })?.text).toBe("");
  });

  it("maps unknown kind to favorite, drops non-objects", () => {
    expect(normalizeImportedMarker({ kind: "note", text: "x" })?.kind).toBe("favorite");
    expect(normalizeImportedMarker(null)).toBeNull();
    expect(normalizeImportedMarker("fav")).toBeNull();
    expect(normalizeImportedMarker(42)).toBeNull();
  });

  it("takes anchor from anchor_sec ?? time, drops garbage times", () => {
    expect(normalizeImportedMarker({ kind: "comment", anchor_sec: 5 })?.anchorSec).toBe(5);
    expect(normalizeImportedMarker({ kind: "comment", time: 7 })?.anchorSec).toBe(7);
    expect(normalizeImportedMarker({ kind: "comment", anchor_sec: "abc" })?.anchorSec).toBeUndefined();
    expect(normalizeImportedMarker({ kind: "comment", start_sec: "" })?.startSec).toBeUndefined();
  });

  it("JSON round-trip: fav/neg with text survive stringify → parse → normalize", () => {    const exported = JSON.stringify([
      { marker_id: "f1", kind: "favorite", start_sec: 1, end_sec: 2, anchor_sec: 1.5, label: "Favorite", text: "держать — свет" },
      { marker_id: "n1", kind: "negative", start_sec: 9, end_sec: 10, anchor_sec: 9.5, label: "Negative", text: "фокус ушёл" },
    ]);
    const parsed = JSON.parse(exported);
    const norms = parsed.map(normalizeImportedMarker);
    expect(norms[0]).toMatchObject({ kind: "favorite", text: "держать — свет", anchorSec: 1.5, startSec: 1, endSec: 2 });
    expect(norms[1]).toMatchObject({ kind: "negative", text: "фокус ушёл", anchorSec: 9.5, startSec: 9, endSec: 10 });
  });

  // tb_1791583578_64923_1: автор из файла (agent:<роль> — пометка «ИИ»).
  it("passes author through, drops garbage", () => {
    expect(normalizeImportedMarker({ kind: "comment", text: "x", author: "agent:Beta" })?.author).toBe("agent:Beta");
    expect(normalizeImportedMarker({ kind: "comment", text: "x", author: "  Danila " })?.author).toBe("Danila");
    expect(normalizeImportedMarker({ kind: "comment", text: "x" })?.author).toBeUndefined();
    expect(normalizeImportedMarker({ kind: "comment", text: "x", author: "   " })?.author).toBeUndefined();
    expect(normalizeImportedMarker({ kind: "comment", text: "x", author: 42 })?.author).toBeUndefined();
  });

  // tb_1791585558_31907_1: ссылка ответа.
  it("passes reply_to through, drops garbage", () => {
    expect(normalizeImportedMarker({ kind: "comment", text: "y", reply_to: "q03-c1" })?.reply_to).toBe("q03-c1");
    expect(normalizeImportedMarker({ kind: "comment", text: "y" })?.reply_to).toBeUndefined();
    expect(normalizeImportedMarker({ kind: "comment", text: "y", reply_to: "a b" })?.reply_to).toBeUndefined();
    expect(normalizeImportedMarker({ kind: "comment", text: "y", reply_to: "" })?.reply_to).toBeUndefined();
  });

  // tb_1791809796_24701_1: id вопроса едет через импорт (выжимка ответов).
  it("passes question_id through, drops garbage", () => {
    expect(normalizeImportedMarker({ kind: "in", text: "q", question_id: "mrg-01" })?.question_id).toBe("mrg-01");
    expect(normalizeImportedMarker({ kind: "in", text: "q" })?.question_id).toBeUndefined();
    expect(normalizeImportedMarker({ kind: "in", text: "q", question_id: "   " })?.question_id).toBeUndefined();
  });
});
