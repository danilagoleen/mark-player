import { describe, expect, it } from "vitest";
import { filterCommentMarkers, selectCommentMarkerId, selectMediaFromSearch } from "./comments";

const MARKERS = [
  { marker_id: "m1", kind: "comment", start_sec: 1, media_path: "a.mp4" },
  { marker_id: "f1", kind: "favorite", start_sec: 2, media_path: "a.mp4" },
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
    expect(selectCommentMarkerId(MARKERS, "?media=a.mp4&marker=f1")).toBe("m2");
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
    expect(visible.map((m) => m.marker_id)).toEqual(["m1", "m2"]);
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
});
