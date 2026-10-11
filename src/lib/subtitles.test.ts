import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseSubtitleSrt,
  findCuesAt,
  looksLikeMarkers,
  decodeSubtitleBytes,
  loadSubtitleStore,
  saveSubtitleTrack,
  removeSubtitleTrack,
  resolveSubtitleTrackKey,
  SUBTITLES_STORAGE_KEY,
  type SubtitleCue,
} from "./subtitles";

function lsMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", lsMock());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// tb_1791156671_82609_1: unit из спеки.
describe("parseSubtitleSrt", () => {
  it("parses BOM + CRLF", () => {
    const { cues, errors } = parseSubtitleSrt(
      "﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\n",
    );
    expect(errors).toEqual([]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 2, text: "Hello" });
  });

  it("accepts dot milliseconds and blocks without numbers", () => {
    const { cues, errors } = parseSubtitleSrt(
      "00:00:01.500 --> 00:00:02.000\nNo number\n\n7\n00:00:03,000 --> 00:00:04,000\nNumbered\n",
    );
    expect(errors).toEqual([]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1.5, text: "No number" });
  });

  it("keeps overlapping cues as-is, reports bad blocks with line numbers", () => {
    const { cues, errors } = parseSubtitleSrt(
      "1\n00:00:01,000 --> 00:00:05,000\nLong\n\n2\n00:00:03,000 --> 00:00:04,000\nShort\n\n3\nno timing here\ntext\n",
    );
    expect(cues).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/line \d+/);
  });

  it("preserves multiline breaks", () => {
    const { cues } = parseSubtitleSrt("1\n00:00:01,000 --> 00:00:02,000\nLine one\nLine two\n");
    expect(cues[0].text).toBe("Line one\nLine two");
  });
});

describe("decodeSubtitleBytes", () => {
  it("decodes utf-8 as-is", () => {
    const buf = new TextEncoder().encode("Привет").buffer as ArrayBuffer;
    const { text, encoding } = decodeSubtitleBytes(buf);
    expect(encoding).toBe("utf-8");
    expect(text).toBe("Привет");
  });

  it("falls back to cp1251 on invalid utf-8", () => {
    // «Привет» в cp1251 — невалидный UTF-8.
    const bytes = new Uint8Array([207, 240, 232, 226, 229, 242]);
    const { text, encoding } = decodeSubtitleBytes(bytes.buffer as ArrayBuffer);
    expect(encoding).toBe("cp1251");
    expect(text).toBe("Привет");
  });
});

describe("findCuesAt", () => {
  const cues: SubtitleCue[] = [
    { start: 1, end: 3, text: "a" },
    { start: 2, end: 4, text: "b" },
    { start: 10, end: 12, text: "c" },
  ];

  it("start inclusive, end exclusive", () => {
    expect(findCuesAt(cues, 1).map((c) => c.text)).toEqual(["a"]);
    expect(findCuesAt(cues, 3).map((c) => c.text)).toEqual(["b"]);
    expect(findCuesAt(cues, 4).map((c) => c.text)).toEqual([]);
  });

  it("shows both overlapping cues", () => {
    expect(findCuesAt(cues, 2.5).map((c) => c.text)).toEqual(["a", "b"]);
  });

  it("misses gaps and handles empty", () => {
    expect(findCuesAt(cues, 5)).toEqual([]);
    expect(findCuesAt([], 1)).toEqual([]);
  });
});

describe("looksLikeMarkers", () => {
  it("detects marker-prefixed tracks at >=50%", () => {
    const cues = [
      { start: 1, end: 2, text: "★ good" },
      { start: 3, end: 4, text: "✗ bad" },
      { start: 5, end: 6, text: "plain" },
      { start: 7, end: 8, text: "· note" },
    ];
    expect(looksLikeMarkers(cues)).toBe(true);
    expect(looksLikeMarkers([cues[2]])).toBe(false);
    expect(looksLikeMarkers([])).toBe(false);
  });
});

describe("subtitle store", () => {
  it("saves per media path, replaces on re-import, removes", () => {
    saveSubtitleTrack("/a.mp4", [{ start: 1, end: 2, text: "one" }], "a.srt");
    saveSubtitleTrack("/b.mp4", [{ start: 1, end: 2, text: "two" }], "b.srt");
    let store = loadSubtitleStore();
    expect(store["/a.mp4"].cues).toHaveLength(1);
    expect(store["/b.mp4"].cues[0].text).toBe("two");
    saveSubtitleTrack("/a.mp4", [{ start: 5, end: 6, text: "new" }], "a2.srt");
    store = loadSubtitleStore();
    expect(store["/a.mp4"].cues[0].text).toBe("new");
    expect(store["/a.mp4"].sourceName).toBe("a2.srt");
    removeSubtitleTrack("/a.mp4");
    store = loadSubtitleStore();
    expect(store["/a.mp4"]).toBeUndefined();
    expect(store["/b.mp4"].cues).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(SUBTITLES_STORAGE_KEY) || "{}")["/b.mp4"]).toBeTruthy();
  });
});

describe("resolveSubtitleTrackKey", () => {
  it("prefers absolute path, falls back to media identity", () => {
    expect(resolveSubtitleTrackKey("/a.mp4", "blob:x")).toBe("/a.mp4");
    expect(resolveSubtitleTrackKey(null, "video.mp4")).toBe("video.mp4");
    expect(resolveSubtitleTrackKey(null, null)).toBeNull();
  });
});
