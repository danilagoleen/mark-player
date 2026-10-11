import { describe, expect, it } from "vitest";
import { buildPlaylistVisualRows, playlistFrameFileName } from "./playlistVisualReview";
import { buildVisualReviewHtml } from "./frameSnapshots";

const jpeg = new Uint8Array([1, 2, 3]);

describe("playlistFrameFileName", () => {
  it("префикс секции защищает от коллизий таймкодов", () => {
    expect(playlistFrameFileName(0, "00-00-04-00.jpg")).toBe("01-00-00-04-00.jpg");
    expect(playlistFrameFileName(11, "f.jpg")).toBe("12-f.jpg");
  });
});

describe("buildPlaylistVisualRows", () => {
  it("строки несут секцию, таймкод посекционным fps, кадры с префиксом", () => {
    const rows = buildPlaylistVisualRows([
      {
        title: "1. a.mp4",
        markers: [{ marker_id: "m1", anchor_sec: 4, kind: "comment", label: "", text: "hi" }],
        fps: 25,
        frames: new Map([["m1", { marker_id: "m1", fileName: "00-00-04-00.jpg", jpeg }]]),
      },
      {
        title: "2. b.mp4",
        markers: [{ marker_id: "m2", anchor_sec: 4, kind: "favorite", label: "top", text: "" }],
        fps: 30,
        frames: new Map(),
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].section).toBe("1. a.mp4");
    expect(rows[0].timecode).toBe("00:00:04:00");
    expect(rows[0].fileName).toBe("01-00-00-04-00.jpg");
    expect(rows[0].dataUrl?.startsWith("data:image/jpeg;base64,")).toBe(true);
    // Тот же anchor другим fps — другой таймкод; кадра нет — честный null.
    expect(rows[1].section).toBe("2. b.mp4");
    expect(rows[1].timecode).toBe("00:00:04:00");
    expect(rows[1].fileName).toBeNull();
    expect(rows[1].dataUrl).toBeNull();
  });

  it("html печатает заголовок секции один раз на смену", () => {
    const rows = buildPlaylistVisualRows([
      {
        title: "1. a.mp4",
        markers: [
          { marker_id: "m1", anchor_sec: 1, kind: "comment", label: "", text: "" },
          { marker_id: "m2", anchor_sec: 2, kind: "comment", label: "", text: "" },
        ],
        fps: 25,
        frames: new Map(),
      },
    ]);
    const html = buildVisualReviewHtml({ title: "T", fps: 25, frameCount: 0, markerCount: 2, rows });
    expect(html.match(/<h2 class="sec">1\. a\.mp4<\/h2>/g)).toHaveLength(1);
  });
});
