import { describe, expect, it } from "vitest";
import { buildPlaylistMarkersJson, shiftSrtMarkers, playlistReelName } from "./playlistMediaExports";
import { exportMarkersToSrtV2, exportPlaylistToEdl } from "../srtUtils";

describe("buildPlaylistMarkersJson", () => {
  it("один документ: схема playlist-markers/1, файлы подряд", () => {
    const json = buildPlaylistMarkersJson("Trip", [
      {
        file: "a.mp4",
        markers: [{ marker_id: "m1", kind: "comment", start_sec: 1, end_sec: 1, anchor_sec: 1, label: "", text: "hi" }],
        provisional_events: [],
      },
      { file: "b.mp4", markers: [], provisional_events: [] },
    ]);
    const doc = JSON.parse(json);
    expect(doc.playlist_markers_version).toBe("1");
    expect(doc.playlist).toBe("Trip");
    expect(doc.files).toHaveLength(2);
    expect(doc.files[0].markers[0].text).toBe("hi");
    expect(doc.files[1].markers).toEqual([]);
  });
});

describe("shiftSrtMarkers", () => {
  const full = (part: { kind: string; start_sec: number; end_sec: number; label: string; text: string }) => ({
    marker_id: "m", anchor_sec: part.start_sec, media_path: "f", ...part,
  });
  it("сдвиг ленты + сквозная нумерация одним вызовом", () => {
    const a = [full({ kind: "comment", start_sec: 1, end_sec: 2, label: "", text: "one" })];
    const b = shiftSrtMarkers([full({ kind: "comment", start_sec: 1, end_sec: 2, label: "", text: "two" })], 100);
    const srt = exportMarkersToSrtV2([...a, ...b]);
    expect(srt).toContain("00:00:01,000 --> 00:00:02,000");
    expect(srt).toContain("00:01:41,000 --> 00:01:42,000");
    expect(srt.match(/^1$/m)).toBeTruthy();
    expect(srt.match(/^2$/m)).toBeTruthy();
  });

  it("нулевой сдвиг возвращает тот же массив", () => {
    const m = [full({ kind: "comment", start_sec: 1, end_sec: 2, label: "", text: "" })];
    expect(shiftSrtMarkers(m, 0)).toBe(m);
  });
});

describe("playlistReelName", () => {
  it("ASCII-стем капсом, мусор — PL+номер", () => {
    expect(playlistReelName("clip.mp4", 0)).toBe("CLIP");
    expect(playlistReelName("мое видео.mov", 4)).toBe("MOEVIDEO");
    expect(playlistReelName("🎬.mp4", 4)).toBe("PL05");
    expect(playlistReelName("a/b/very-long-name.mp4", 0)).toHaveLength(8);
  });
});

describe("exportPlaylistToEdl", () => {
  it("шапка одна, нумерация сквозная, REC со сдвигом, reel по файлам", () => {
    const edl = exportPlaylistToEdl(
      [
        {
          reel: "A",
          markers: [{ kind: "comment", start_sec: 1, end_sec: 2, label: "", text: "one" }],
          fps: 25,
          recOffsetSec: 0,
        },
        {
          reel: "B",
          markers: [{ kind: "comment", start_sec: 1, end_sec: 2, label: "", text: "two" }],
          fps: 25,
          recOffsetSec: 100,
        },
      ],
      "Trip",
    );
    const lines = edl.split("\n");
    expect(lines[0]).toBe("TITLE: Trip");
    expect(lines.filter((l) => l.startsWith("TITLE:"))).toHaveLength(1);
    // SRC родные у обоих, REC второго сдвинут на 100с.
    expect(edl).toContain("001  A        V     C        00:00:01:00 00:00:02:00 00:00:01:00 00:00:02:00");
    expect(edl).toContain("002  B        V     C        00:00:01:00 00:00:02:00 00:01:41:00 00:01:42:00");
  });
});
