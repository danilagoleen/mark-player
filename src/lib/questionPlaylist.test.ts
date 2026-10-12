// tb_1791521998_11250_5: схема плейлиста-вопроса + answers.json.
import { describe, expect, it } from "vitest";
import {
  answersFromMarkers,
  appendAnswerRecord,
  findQuestionEntry,
  formatAnswerReplyText,
  isQuestionPlaylist,
  lerpQuestionBox,
  normalizeQuestionBox,
  normalizeQuestionEntry,
  parseAnswerReplyText,
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

describe("parseAnswerReplyText (tb_1791809796_24701_1)", () => {
  it("полная грамматика choice: comment (verdict)", () => {
    expect(parseAnswerReplyText("[answer] same: сошлось (favorite)")).toEqual({
      verdict: "favorite",
      choice: "same",
      comment: "сошлось",
    });
  });
  it("голый вердикт", () => {
    expect(parseAnswerReplyText("[answer] (negative)")).toEqual({ verdict: "negative" });
  });
  it("одиночный head — single, разберёт выжимка", () => {
    expect(parseAnswerReplyText("[answer] pan (favorite)")).toEqual({ verdict: "favorite", single: "pan" });
  });
  it("без префикса и мусор — null", () => {
    expect(parseAnswerReplyText("просто текст")).toBeNull();
    expect(parseAnswerReplyText("[answer] x (unknown)")).toBeNull();
    expect(parseAnswerReplyText(null)).toBeNull();
  });
});

describe("answersFromMarkers (tb_1791809796_24701_1: выжимка вместо второго пути)", () => {
  const qmat = {
    marker_id: "qmat_mrg-01_in",
    kind: "comment",
    start_sec: 10,
    end_sec: 12,
    anchor_sec: 10,
    text: "Кто это?",
    author: "agent:Beta",
    question_id: "mrg-01",
  };
  const reply = (over: Record<string, unknown> = {}) => ({
    marker_id: "reply_1",
    kind: "comment",
    start_sec: 10,
    end_sec: 12,
    anchor_sec: 11.5,
    text: "[answer] pan: сошлось (favorite)",
    author: "operator",
    reply_to: "qmat_mrg-01_in",
    created_at: "2026-10-12T02:00:00Z",
    ...over,
  });
  it("прямой ребёнок qmat с префиксом — запись со всеми полями", () => {
    const [r] = answersFromMarkers([qmat, reply()]);
    expect(r.question_id).toBe("mrg-01");
    expect(r.verdict).toBe("favorite");
    expect(r.choice).toBe("pan");
    expect(r.comment).toBe("сошлось");
    expect(r.t_sec).toBe(11.5);
    expect(r.answered_at).toBe("2026-10-12T02:00:00Z");
    expect(r.in_sec).toBe(10);
    expect(r.out_sec).toBe(12);
    expect(r.confirmed_by).toBe("operator");
  });
  it("свободный текст без префикса — verdict comment", () => {
    const [r] = answersFromMarkers([qmat, reply({ text: "сомневаюсь, переснять" })]);
    expect(r.verdict).toBe("comment");
    expect(r.comment).toBe("сомневаюсь, переснять");
  });
  it("одиночный head: в вариантах — choice, иначе comment", () => {
    const m = [qmat, reply({ text: "[answer] pan (favorite)" })];
    expect(answersFromMarkers(m, { choicesOf: () => ["pan", "tilt"] })[0].choice).toBe("pan");
    expect(answersFromMarkers(m, { choicesOf: () => ["tilt"] })[0].comment).toBe("pan");
    expect(answersFromMarkers(m)[0].comment).toBe("pan");
  });
  it("обычный тред (родитель не qmat) — мимо, даже с префиксом", () => {
    const plain = { marker_id: "comment_1", kind: "comment", start_sec: 5, end_sec: 5, anchor_sec: 5, text: "x" };
    expect(answersFromMarkers([plain, reply({ reply_to: "comment_1" })])).toEqual([]);
  });
  it("родитель потерян / пустой текст — мимо", () => {
    expect(answersFromMarkers([reply({ reply_to: "nope" })])).toEqual([]);
    expect(answersFromMarkers([qmat, reply({ text: "  " })])).toEqual([]);
  });
  it("легаси qmat без поля — через resolveLegacyQuestionId", () => {
    const { question_id: _drop, ...legacy } = qmat;
    const withId = { ...legacy, marker_id: "qmat_mrg-02_in" };
    const opts = { resolveLegacyQuestionId: (id: string) => (id.startsWith("qmat_mrg-02_") ? "mrg-02" : undefined) };
    const child = reply({ reply_to: "qmat_mrg-02_in" });
    expect(answersFromMarkers([withId, child], opts)[0].question_id).toBe("mrg-02");
    expect(answersFromMarkers([withId, child])).toEqual([]);
  });
  it("пустой автор — confirmed_by operator, как раньше", () => {
    const [r] = answersFromMarkers([qmat, reply({ author: "" })]);
    expect(r.confirmed_by).toBe("operator");
  });
});
