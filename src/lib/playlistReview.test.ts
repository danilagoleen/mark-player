import { describe, expect, it } from "vitest";
import { buildPlaylistReviewText } from "./playlistReview";

const A = { kind: "comment", start_sec: 4, end_sec: 4, label: "", text: "hello" };
const CUT_IN = { kind: "in", start_sec: 10, end_sec: 10, label: "", text: "" };
const CUT_OUT = { kind: "out", start_sec: 20, end_sec: 20, label: "", text: "" };

describe("buildPlaylistReviewText", () => {
  it("один документ: шапка + секции по файлам подряд", () => {
    const txt = buildPlaylistReviewText("Trip", [
      { fileName: "a.mp4", markers: [A], fps: 25 },
      { fileName: "b.mp4", markers: [CUT_IN, CUT_OUT], fps: 25 },
    ]);
    const lines = txt.split("\n");
    expect(lines[0]).toBe("Review notes — Trip");
    expect(lines[1]).toBe("=== 1. a.mp4 ===");
    expect(txt).toContain("=== 2. b.mp4 ===");
    expect(txt).toContain("hello");
    expect(txt).toContain("Cut 00:00:10:00 → 00:00:20:00");
    // Порядок: секция 1 целиком до секции 2.
    expect(txt.indexOf("hello")).toBeLessThan(txt.indexOf("=== 2. b.mp4 ==="));
  });

  it("пустой файл — честная строка вместо тишины", () => {
    const txt = buildPlaylistReviewText("Trip", [{ fileName: "empty.mp4", markers: [], fps: 25 }]);
    expect(txt).toContain("=== 1. empty.mp4 ===");
    expect(txt).toContain("(no markers)");
  });

  it("honestyNote секции идёт сразу под её заголовком", () => {
    const txt = buildPlaylistReviewText("Trip", [
      { fileName: "a.mp4", markers: [A], fps: 25, honestyNote: "fps unknown — timecodes at 25fps" },
    ]);
    const lines = txt.split("\n");
    expect(lines[1]).toBe("=== 1. a.mp4 ===");
    expect(lines[2]).toBe("fps unknown — timecodes at 25fps");
  });
});
