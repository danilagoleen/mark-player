import { describe, expect, it } from "vitest";
import { buildCommentMarker, buildReplyMarker, filterCommentMarkers, selectAtFromSearch, selectCommentMarkerId, selectFilterFromSearch, selectHashFromSearch, selectMediaFromSearch } from "./comments";

const MARKERS = [
  { marker_id: "m1", kind: "comment", start_sec: 1, media_path: "a.mp4" },
  { marker_id: "f1", kind: "favorite", start_sec: 2, media_path: "a.mp4", text: "почему fav" },
  { marker_id: "f2", kind: "favorite", start_sec: 2.5, media_path: "a.mp4" },
  { marker_id: "m2", kind: "comment", start_sec: 3, media_path: "a.mp4" },
  { marker_id: "x1", kind: "comment", start_sec: 400, media_path: "b.mp4" },
];

describe("selectCommentMarkerId", () => {
  // [signal: query marker выбирается] [project: cut-player]
  it("picks the marker requested via ?marker= when it is a comment of that media", () => {
    expect(selectCommentMarkerId(MARKERS, "?media=a.mp4&marker=m1")).toBe("m1");
  });

  // [signal: чужой query откатывается на последний свой] [project: cut-player]
  it("falls back to the last comment of the media when query misses", () => {
    expect(selectCommentMarkerId(MARKERS, "?media=a.mp4")).toBe("m2");
    expect(selectCommentMarkerId(MARKERS, "?media=a.mp4&marker=nope")).toBe("m2");
    expect(selectCommentMarkerId(MARKERS, "?media=a.mp4&marker=f2")).toBe("m2");
  });

  // tb_1791146800_70644_20: ?marker= на fav С текстом — резолвится (он несёт слова).
  it("resolves ?marker= pointing at a text-carrying non-comment", () => {
    expect(selectCommentMarkerId(MARKERS, "?media=a.mp4&marker=f1")).toBe("f1");
  });

  // [signal: media-scope режет чужие] [project: cut-player]
  it("never leaks comments from other media", () => {
    expect(selectCommentMarkerId(MARKERS, "?media=b.mp4")).toBe("x1");
    expect(selectCommentMarkerId(MARKERS, "?media=b.mp4&marker=m1")).toBe("x1");
    expect(selectCommentMarkerId(MARKERS, "?media=c.mp4")).toBeNull();
  });

  // [signal: без media пусто] [project: cut-player]
  it("returns null when media is missing", () => {
    expect(selectCommentMarkerId(MARKERS, "")).toBeNull();
    expect(selectCommentMarkerId(MARKERS, "?marker=m1")).toBeNull();
    expect(selectCommentMarkerId([], "?media=a.mp4")).toBeNull();
  });
});

describe("filterCommentMarkers (0.10.16c list scope)", () => {
  // [signal: список режется по media] [project: cut-player]
  it("возвращает только комменты своего media", () => {
    const visible = filterCommentMarkers(MARKERS, "a.mp4");
    expect(visible.map((m) => m.marker_id)).toEqual(["m1", "f1", "m2"]);
  });

  // tb_1791146800_70644_20: fav с текстом виден (несёт слова), пустой fav — нет.
  it("показывает не-комменты с текстом, пустые скрывает", () => {
    const visible = filterCommentMarkers(MARKERS, "a.mp4");
    expect(visible.some((m) => m.marker_id === "f1")).toBe(true);
    expect(visible.some((m) => m.marker_id === "f2")).toBe(false);
  });

  it("отрезает чужие и не-комменты", () => {
    const visible = filterCommentMarkers(MARKERS, "b.mp4");
    expect(visible.map((m) => m.marker_id)).toEqual(["x1"]);
    expect(filterCommentMarkers(MARKERS, "c.mp4")).toEqual([]);
  });

  it("без media — пусто, а не общая куча", () => {
    expect(filterCommentMarkers(MARKERS, null)).toEqual([]);
  });

  it("selectMediaFromSearch вынимает media из query", () => {
    expect(selectMediaFromSearch("?media=a.mp4&marker=m1")).toBe("a.mp4");
    expect(selectMediaFromSearch("?marker=m1")).toBeNull();
    expect(selectMediaFromSearch("")).toBeNull();
  });

  it("selectHashFromSearch вынимает chash из query", () => {
    expect(selectHashFromSearch("?media=a.mp4&chash=ch1:aaaa")).toBe("ch1:aaaa");
    expect(selectHashFromSearch("?media=a.mp4")).toBeNull();
    expect(selectHashFromSearch("")).toBeNull();
  });
});

describe("filterCommentMarkers (0.22 content-hash identity)", () => {
  const HASHED = [
    { marker_id: "h1", kind: "comment", start_sec: 1, media_path: "orig.mp4", content_hash: "ch1:aaaa" },
    { marker_id: "h2", kind: "comment", start_sec: 2, media_path: "orig.mp4", content_hash: "ch1:bbbb" },
    { marker_id: "l1", kind: "comment", start_sec: 3, media_path: "copy.mp4" },
  ];

  it("копия видит метки оригинала по хешу", () => {
    expect(filterCommentMarkers(HASHED, "copy.mp4", "ch1:aaaa").map((m) => m.marker_id)).toEqual(["h1", "l1"]);
  });

  it("чужой хеш при том же пути — строго пусто", () => {
    expect(filterCommentMarkers(HASHED, "orig.mp4", "ch1:zzzz")).toEqual([]);
  });

  it("без хеша — старое поведение по пути", () => {
    expect(filterCommentMarkers(HASHED, "copy.mp4").map((m) => m.marker_id)).toEqual(["l1"]);
  });
});

describe("filterAllMediaMarkers (_18: все виды)", () => {
  const ALL = [
    { marker_id: "f1", kind: "favorite", start_sec: 2, media_path: "a.mp4" },
    { marker_id: "n1", kind: "negative", start_sec: 4, media_path: "a.mp4" },
    { marker_id: "i1", kind: "in", start_sec: 5, media_path: "a.mp4" },
    { marker_id: "o1", kind: "out", start_sec: 8, media_path: "a.mp4" },
    { marker_id: "m1", kind: "comment", start_sec: 1, media_path: "a.mp4" },
    { marker_id: "x1", kind: "favorite", start_sec: 1, media_path: "b.mp4" },
  ];

  it("возвращает все виды своего media, пустые не режет", async () => {
    const { filterAllMediaMarkers } = await import("./comments");
    expect(filterAllMediaMarkers(ALL, "a.mp4").map((m) => m.marker_id)).toEqual(["f1", "n1", "i1", "o1", "m1"]);
  });

  it("чужие отрезаны, без media — пусто", async () => {
    const { filterAllMediaMarkers } = await import("./comments");
    expect(filterAllMediaMarkers(ALL, "b.mp4").map((m) => m.marker_id)).toEqual(["x1"]);
    expect(filterAllMediaMarkers(ALL, null)).toEqual([]);
  });
});

// tb_1791654032_27281_1: якорь нового коммента из ?at=.
describe("selectAtFromSearch", () => {
  it("число как есть, мусор/минус/пусто — 0", () => {
    expect(selectAtFromSearch("?media=a&at=12.5")).toBe(12.5);
    expect(selectAtFromSearch("?media=a&at=0")).toBe(0);
    expect(selectAtFromSearch("?media=a")).toBe(0);
    expect(selectAtFromSearch("?media=a&at=junk")).toBe(0);
    expect(selectAtFromSearch("?media=a&at=-3")).toBe(0);
  });
});

describe("selectFilterFromSearch (tb_1791690899_1275_3: фильтр с иконки)", () => {
  it("?filter=comments → comment, мусор/пусто → all", () => {
    expect(selectFilterFromSearch("?media=a&filter=comments")).toBe("comment");
    expect(selectFilterFromSearch("?media=a&filter=comment")).toBe("comment");
    expect(selectFilterFromSearch("?media=a")).toBe("all");
    expect(selectFilterFromSearch("?media=a&filter=all")).toBe("all");
    expect(selectFilterFromSearch("?media=a&filter=in")).toBe("all");
  });
});

describe("buildCommentMarker (tb_1791690899_1275_3: якорь не в ноль)", () => {
  it("кладёт anchor_sec/start_sec/end_sec в точку at", () => {
    const m = buildCommentMarker({ media: "a.mp4", contentHash: null, author: "me", at: 12.5, text: "hi" });
    expect(m.kind).toBe("comment");
    expect(m.start_sec).toBe(12.5);
    expect(m.end_sec).toBe(12.5);
    expect(m.anchor_sec).toBe(12.5);
    expect(m.media_path).toBe("a.mp4");
    expect(m.text).toBe("hi");
  });
  it("мусорный at → 0, а не NaN", () => {
    expect(buildCommentMarker({ media: "a.mp4", contentHash: null, author: "me", at: NaN, text: "x" }).anchor_sec).toBe(0);
    expect(buildCommentMarker({ media: "a.mp4", contentHash: null, author: "me", at: -5, text: "x" }).anchor_sec).toBe(0);
  });
});

describe("buildReplyMarker (tb_1791690899_1275_3: ответ в точке родителя)", () => {
  it("берёт anchor родителя, reply_to проставлен", () => {
    const parent = { marker_id: "p1", kind: "comment", start_sec: 7, anchor_sec: 7.5, media_path: "a.mp4" };
    const r = buildReplyMarker(parent, "ok", "me");
    expect(r?.anchor_sec).toBe(7.5);
    expect(r?.start_sec).toBe(7);
    expect(r?.reply_to).toBe("p1");
  });
  it("родитель без anchor — добивка из start_sec", () => {
    const parent = { marker_id: "p1", kind: "comment", start_sec: 9, media_path: "a.mp4" };
    expect(buildReplyMarker(parent, "ok", "me")?.anchor_sec).toBe(9);
  });
  it("нет родителя — null", () => {
    expect(buildReplyMarker(null as unknown as { marker_id: string; kind: string; start_sec: number }, "x", "me")).toBeNull();
  });
});
