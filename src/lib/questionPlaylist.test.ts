// tb_1791521998_11250_5: схема плейлиста-вопроса + answers.json.
import { describe, expect, it } from "vitest";
import {
  answersFromMarkers,
  appendAnswerRecord,
  findQuestionEntry,
  findQuestionEntryAtTime,
  formatAnswerReplyText,
  isQuestionPlaylist,
  lerpQuestionBox,
  mergeAnswerRecords,
  normalizeQuestionBox,
  normalizeQuestionEntry,
  parseAnswerReplyText,
  parseAnswersFile,
  resolveAnswers,
  resolveQuestionSnapTime,
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

describe("findQuestionEntryAtTime (tb_1791819024_26192_2: follow playhead)", () => {
  const entries = [
    { path: "/v/c.mp4", name: "c", duration: 300, addedAt: "x", question_id: "m1", in_sec: 0, out_sec: 10 },
    { path: "/v/c.mp4", name: "c", duration: 300, addedAt: "x", question_id: "m2", in_sec: 10, out_sec: 20 },
    { path: "/v/d.mp4", name: "d", duration: 50, addedAt: "x", question_id: "s1", in_sec: 15, out_sec: 35 },
    { path: "/v/c.mp4", name: "c", duration: 300, addedAt: "x", question_id: "m3" },
  ];
  it("внутри скобок — своя запись того же файла", () => {
    expect(findQuestionEntryAtTime(entries, "/v/c.mp4", 5)?.question_id).toBe("m1");
    expect(findQuestionEntryAtTime(entries, "/v/c.mp4", 15)?.question_id).toBe("m2");
    expect(findQuestionEntryAtTime(entries, "/v/d.mp4", 20)?.question_id).toBe("s1");
  });
  it("вне скобок / чужой файл / без скобок — null (держим последнюю)", () => {
    expect(findQuestionEntryAtTime(entries, "/v/c.mp4", 25)).toBeNull();
    expect(findQuestionEntryAtTime(entries, "/v/e.mp4", 5)).toBeNull();
    expect(findQuestionEntryAtTime(entries, "/v/c.mp4", NaN)).toBeNull();
    expect(findQuestionEntryAtTime([], "/v/c.mp4", 5)).toBeNull();
  });
});

describe("mergeAnswerRecords (tb_1791819024_26192_2: не стирает)", () => {
  const old1: AnswerRecord = { question_id: "q1", verdict: "favorite", answered_at: "t1" };
  const dup: AnswerRecord = { question_id: "q1", verdict: "favorite", answered_at: "t1" };
  const fresh: AnswerRecord = { question_id: "q1", verdict: "negative", comment: "x", answered_at: "t2" };
  it("старое цело, новое дописывается, дубли нет", () => {
    const merged = mergeAnswerRecords([old1], [dup, fresh]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(old1);
    expect(merged[1].verdict).toBe("negative");
  });
  it("пустой вход — как есть", () => {
    expect(mergeAnswerRecords([], [fresh])).toHaveLength(1);
    expect(mergeAnswerRecords([old1], [])).toEqual([old1]);
  });
});

describe("resolveQuestionSnapTime (tb_1791848907_63972_2: рывок только из щели)", () => {
  const entries = [
    { path: "/v/c.mp4", name: "c", duration: 300, addedAt: "x", question_id: "m1", in_sec: 0, out_sec: 10 },
    { path: "/v/c.mp4", name: "c", duration: 300, addedAt: "x", question_id: "m2", in_sec: 10, out_sec: 20 },
  ];
  const m1 = { question_id: "m1", in_sec: 0, out_sec: 10 };
  it("внутри своего — null (не дёргаем)", () => {
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 5, m1)).toBeNull();
  });
  it("внутри ЧУЖОГО — null (баунс cmd/shift-вперёд чинится: follow подхватит)", () => {
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 15, m1)).toBeNull();
  });
  it("щель (вне всех) — рывок к in активного", () => {
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 25, m1)).toBe(0);
  });
  it("без активного / без in — null", () => {
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 25, null)).toBeNull();
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 25, { question_id: "m9" })).toBeNull();
  });
  it("tb_1791871361_84020_1: ножницы ON — за OUT молчим (владения tail), щель до in — рывок", () => {
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 25, m1, true)).toBeNull();
    const m9 = { question_id: "m9", in_sec: 30, out_sec: 40 };
    const entries9 = [{ path: "/v/c.mp4", question_id: "m9", in_sec: 30, out_sec: 40 }];
    expect(resolveQuestionSnapTime(entries9, "/v/c.mp4", 25, m9, true)).toBe(30);
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 25, m1, false)).toBe(0);
    expect(resolveQuestionSnapTime(entries, "/v/c.mp4", 25, m1)).toBe(0);
  });
});
