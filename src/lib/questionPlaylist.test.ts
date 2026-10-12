// tb_1791521998_11250_5: схема плейлиста-вопроса + answers.json.
import { describe, expect, it } from "vitest";
import {
  appendAnswerRecord,
  findQuestionEntry,
  formatAnswerReplyText,
  isQuestionPlaylist,
  lerpQuestionBox,
  normalizeQuestionBox,
  normalizeQuestionEntry,
  parseAnswersFile,
  resolveAnswers,
  serializeAnswersFile,
  answersPathFor,
  type AnswerRecord,
} from "./questionPlaylist";
import type { Playlist } from "./playlist";

const OLD_PLAYLIST = {
  id: "old",
  name: "old",
  entries: [{ path: "/v/a.mp4", name: "a", duration: 10, addedAt: "x" }],
  createdAt: "x",
} as Playlist;

describe("isQuestionPlaylist", () => {
  it("старый плейлист — не вопрос (открывается как раньше)", () => {
    expect(isQuestionPlaylist(OLD_PLAYLIST)).toBe(false);
  });
  it("запись с question_id — вопрос", () => {
    const pl = {
      ...OLD_PLAYLIST,
      schema: "vetka.cut.question_playlist/1",
      entries: [{ path: "/v/a.mp4", name: "a", duration: 10, addedAt: "x", question_id: "q1" }],
    } as unknown as Playlist;
    expect(isQuestionPlaylist(pl)).toBe(true);
  });
  it("чужой schema — не вопрос", () => {
    expect(isQuestionPlaylist({ ...OLD_PLAYLIST, schema: "other/9" } as Playlist)).toBe(false);
  });
});

describe("normalizeQuestionEntry", () => {
  it("чистит числа и маркеры, чужое отбрасывает", () => {
    const out = normalizeQuestionEntry({
      question_id: " q1 ",
      question: "План общий?",
      in_sec: "12.5",
      out_sec: -3,
      markers: [
        { kind: "comment", t_sec: 14, text: "граница" },
        { kind: "nope", t_sec: 15 },
        { kind: "favorite", t_sec: "мусор" },
      ],
      ref: { layer: "camera", id: "shot-7" },
      choices: ["pan", "truck", "", 42],
      garbage: true,
    });
    expect(out.question_id).toBe("q1");
    expect(out.in_sec).toBe(12.5);
    expect(out.out_sec).toBeUndefined();
    expect(out.markers).toEqual([
      { kind: "comment", t_sec: 14, text: "граница" },
      { kind: "comment", t_sec: 15 },
    ]);
    expect(out.ref).toEqual({ layer: "camera", id: "shot-7" });
    expect(out.choices).toEqual(["pan", "truck"]);
    expect(out).not.toHaveProperty("garbage");
  });
  it("не-объект — пусто", () => {
    expect(normalizeQuestionEntry(null)).toEqual({});
  });
});

describe("normalizeQuestionBox (tb_1791754893_1275_4)", () => {
  it("валидная рамка чистится", () => {
    expect(normalizeQuestionBox({ x: "0.31", y: 0.22, w: 0.18, h: 0.24 })).toEqual({ x: 0.31, y: 0.22, w: 0.18, h: 0.24 });
  });
  it("мусор отбрасывается целиком", () => {
    expect(normalizeQuestionBox({ x: 0.3, y: 0.2, w: 0, h: 0.2 })).toBeUndefined();
    expect(normalizeQuestionBox({ x: 0.9, y: 0.2, w: 0.2, h: 0.2 })).toBeUndefined();
    expect(normalizeQuestionBox({ x: -0.1, y: 0, w: 0.2, h: 0.2 })).toBeUndefined();
    expect(normalizeQuestionBox({ x: 0, y: 0, w: 1.5, h: 0.2 })).toBeUndefined();
    expect(normalizeQuestionBox(null)).toBeUndefined();
    expect(normalizeQuestionBox("0.1,0.2,0.3,0.4")).toBeUndefined();
  });
  it("bbox/bbox_end едут через normalizeQuestionEntry", () => {
    const out = normalizeQuestionEntry({
      question_id: "pq1",
      bbox: { x: 0.3, y: 0.2, w: 0.2, h: 0.3 },
      bbox_end: { x: 0.32, y: 0.21, w: 0.2, h: 0.3 },
    });
    expect(out.bbox).toEqual({ x: 0.3, y: 0.2, w: 0.2, h: 0.3 });
    expect(out.bbox_end).toEqual({ x: 0.32, y: 0.21, w: 0.2, h: 0.3 });
    expect(normalizeQuestionEntry({ question_id: "pq2", bbox: { x: 2, y: 0, w: 1, h: 1 } })).not.toHaveProperty("bbox");
  });
  it("tolerant-read (tb_1791764026_23730_1): bbox из markers[0], как у Беты", () => {
    const out = normalizeQuestionEntry({
      question_id: "mrg-01",
      in_sec: 257.75,
      out_sec: 261.75,
      markers: [
        {
          kind: "comment",
          t_sec: 259.75,
          text: "merge P254+P278",
          bbox: { x: 0.3844, y: 0.2, w: 0.0698, h: 0.1963 },
          bbox_end: { x: 0.3302, y: 0.0556, w: 0.07, h: 0.19 },
        },
      ],
    });
    expect(out.bbox).toEqual({ x: 0.3844, y: 0.2, w: 0.0698, h: 0.1963 });
    expect(out.bbox_end).toEqual({ x: 0.3302, y: 0.0556, w: 0.07, h: 0.19 });
  });
  it("tolerant-read: своя рамка записи побеждает маркерную", () => {
    const out = normalizeQuestionEntry({
      question_id: "q3",
      bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      markers: [{ kind: "comment", t_sec: 1, bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } }],
    });
    expect(out.bbox).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });
  it("tolerant-read: мусор в маркерах не даёт рамку", () => {
    const out = normalizeQuestionEntry({
      question_id: "q4",
      markers: [{ kind: "comment", t_sec: 1, bbox: { x: 5, y: 0, w: 1, h: 1 } }],
    });
    expect(out).not.toHaveProperty("bbox");
  });
});

describe("lerpQuestionBox (tb_1791754893_1275_4)", () => {
  const a = { x: 0.3, y: 0.2, w: 0.2, h: 0.3 };
  const b = { x: 0.4, y: 0.3, w: 0.2, h: 0.3 };
  it("края и середина", () => {
    expect(lerpQuestionBox(a, b, 0)).toEqual(a);
    expect(lerpQuestionBox(a, b, 1)).toEqual(b);
    expect(lerpQuestionBox(a, b, 0.5)).toEqual({ x: 0.35, y: 0.25, w: 0.2, h: 0.3 });
  });
  it("k клампится", () => {
    expect(lerpQuestionBox(a, b, -2)).toEqual(a);
    expect(lerpQuestionBox(a, b, 99)).toEqual(b);
  });
});

describe("formatAnswerReplyText (tb_1791754893_1275_4)", () => {
  it("choice + comment + verdict", () => {
    expect(formatAnswerReplyText({ verdict: "favorite", choice: "same", comment: "сошлось" })).toBe("[answer] same: сошлось (favorite)");
  });
  it("только verdict", () => {
    expect(formatAnswerReplyText({ verdict: "negative" })).toBe("[answer] (negative)");
  });
  it("пустые строки не едут", () => {
    expect(formatAnswerReplyText({ verdict: "comment", choice: "  ", comment: "" })).toBe("[answer] (comment)");
  });
});
describe("findQuestionEntry", () => {
  const pl = {
    ...OLD_PLAYLIST,
    entries: [
      { path: "/v/a.mp4", name: "a", duration: 10, addedAt: "x" },
      { path: "/v/b.mp4", name: "b", duration: 10, addedAt: "x", question_id: "q2" },
    ],
  } as unknown as Playlist;
  it("по question_id", () => {
    expect(findQuestionEntry(pl, { questionId: "q2" })?.path).toBe("/v/b.mp4");
  });
  it("по path — только запись с вопросом", () => {
    expect(findQuestionEntry(pl, { path: "/v/a.mp4" })).toBeNull();
    expect(findQuestionEntry(pl, { path: "/v/b.mp4" })?.question_id).toBe("q2");
  });
});

describe("answers.json", () => {
  const a1: AnswerRecord = { question_id: "q1", verdict: "negative", answered_at: "2026-10-09T01:00:00Z" };
  const a2: AnswerRecord = { question_id: "q1", verdict: "favorite", choice: "pan", answered_at: "2026-10-09T02:00:00Z" };
  it("append-only + действует последний по answered_at", () => {
    const list = appendAnswerRecord(appendAnswerRecord([], a1), a2);
    expect(list).toHaveLength(2);
    expect(resolveAnswers(list).get("q1")?.verdict).toBe("favorite");
  });
  it("round-trip через файл", () => {
    const back = parseAnswersFile(serializeAnswersFile([a1, a2]));
    expect(back).toHaveLength(2);
    expect(resolveAnswers(back).get("q1")?.choice).toBe("pan");
  });
  it("битый файл — пусто, плеер не падает", () => {
    expect(parseAnswersFile("{nope")).toEqual([]);
    expect(parseAnswersFile(null)).toEqual([]);
  });
  it("путь ответов — рядом с плейлистом", () => {
    expect(answersPathFor("/idx/cal.json")).toBe("/idx/cal.json.answers.json");
  });
});
