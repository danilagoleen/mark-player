// tb_1791521998_11250_5: схема плейлиста-вопроса + answers.json.
import { describe, expect, it } from "vitest";
import {
  appendAnswerRecord,
  findQuestionEntry,
  isQuestionPlaylist,
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
