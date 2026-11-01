import { describe, expect, it } from "vitest";
import {
  COMMENT_ANCHOR_MAX_AGE_MS,
  encodeCommentAnchor,
  parseCommentAnchor,
  selectCommentAnchor,
} from "./commentAnchor";

describe("parseCommentAnchor", () => {
  // [signal: якорь переживает transport] [project: cut-player]
  it("reads a fresh anchor with its media", () => {
    const raw = encodeCommentAnchor("a.mp4", 12.5, 1_000);
    expect(parseCommentAnchor(raw, 1_500)).toEqual({ media: "a.mp4", sec: 12.5, at: 1_000 });
  });

  it("rejects junk, negatives and anchors without media", () => {
    expect(parseCommentAnchor(null, 1_000)).toBeNull();
    expect(parseCommentAnchor("not json", 1_000)).toBeNull();
    expect(parseCommentAnchor(JSON.stringify({ media: "a.mp4", sec: -1, at: 1_000 }), 1_000)).toBeNull();
    expect(parseCommentAnchor(JSON.stringify({ media: "", sec: 1, at: 1_000 }), 1_000)).toBeNull();
    expect(parseCommentAnchor(JSON.stringify({ media: "a.mp4", sec: 1, at: "x" }), 1_000)).toBeNull();
  });

  // tb_1793125816_99982_1: ключ от прошлой сессии не должен становиться якорем.
  it("drops an anchor older than the max age", () => {
    const raw = encodeCommentAnchor("a.mp4", 3, 1_000);
    expect(parseCommentAnchor(raw, 1_000 + COMMENT_ANCHOR_MAX_AGE_MS + 1)).toBeNull();
  });
});

describe("selectCommentAnchor", () => {
  // tb_1793125816_99982_1: Save берёт живой плейхед, а не ?at= с открытия.
  it("prefers the live anchor of the same media over ?at=", () => {
    expect(selectCommentAnchor({
      live: { media: "a.mp4", sec: 42, at: 1_000 },
      media: "a.mp4",
      urlAt: 10,
      now: 1_100,
    })).toBe(42);
  });

  // [signal: чужой якорь не переезжает] [project: cut-player]
  it("falls back to ?at= when the live anchor belongs to another media", () => {
    expect(selectCommentAnchor({
      live: { media: "b.mp4", sec: 42, at: 1_000 },
      media: "a.mp4",
      urlAt: 10,
      now: 1_100,
    })).toBe(10);
  });

  it("falls back to ?at= when there is no live anchor or no media", () => {
    expect(selectCommentAnchor({ live: null, media: "a.mp4", urlAt: 10 })).toBe(10);
    expect(selectCommentAnchor({ live: { media: "a.mp4", sec: 42, at: 1_000 }, media: null, urlAt: 10 })).toBe(10);
  });

  it("falls back to ?at= when the live anchor is stale or negative", () => {
    expect(selectCommentAnchor({
      live: { media: "a.mp4", sec: 42, at: 1_000 },
      media: "a.mp4",
      urlAt: 10,
      now: 1_000 + COMMENT_ANCHOR_MAX_AGE_MS + 1,
    })).toBe(10);
    expect(selectCommentAnchor({
      live: { media: "a.mp4", sec: -5, at: 1_000 },
      media: "a.mp4",
      urlAt: 10,
      now: 1_100,
    })).toBe(10);
  });

  it("never returns a negative ?at=", () => {
    expect(selectCommentAnchor({ live: null, media: "a.mp4", urlAt: -3 })).toBe(0);
    expect(selectCommentAnchor({ live: null, media: "a.mp4", urlAt: Number.NaN })).toBe(0);
  });
});
