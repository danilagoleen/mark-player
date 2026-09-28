import { describe, expect, it } from "vitest";
import { exportMarkersToSrt, importSrtToMarkers, MARKER_PREFIX, appendMarkerToSrt, exportMarkersToSrtV2, exportToSidecar, exportMarkersToXml, exportMarkersToXmeml, exportPlaylistToXmeml, resolvePlaylistMetadata, exportCommentsToText, reviewMarkerName, formatTimecode, resolveXmlFps, resolveXmlFpsSource, resolveXmlHasAudio } from "./srtUtils";

interface TestMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  label: string;
  text: string;
  media_path: string;
}

const markers: TestMarker[] = [
  {
    marker_id: "m1", kind: "favorite",
    start_sec: 5, end_sec: 6, anchor_sec: 5.5,
    label: "Favorite", text: "", media_path: "video.mp4",
  },
  {
    marker_id: "m2", kind: "negative",
    start_sec: 15, end_sec: 16, anchor_sec: 15.5,
    label: "Negative", text: "", media_path: "video.mp4",
  },
  {
    marker_id: "m3", kind: "inout",
    start_sec: 30, end_sec: 35, anchor_sec: 32.5,
    label: "In-Out Range", text: "", media_path: "video.mp4",
  },
  {
    marker_id: "m4", kind: "note",
    start_sec: 50, end_sec: 51, anchor_sec: 50.5,
    label: "Note", text: "check this scene", media_path: "video.mp4",
  },
];

describe("SRT utils", () => {
  it("exports markers to SRT format", () => {
    const srt = exportMarkersToSrt(markers);
    expect(srt).toContain("00:00:05,000 --> 00:00:06,000");
    expect(srt).toContain("FAVORITE");
    expect(srt).toContain("NEGATIVE");
    expect(srt).toContain("IN-OUT");
    expect(srt).toContain("NOTE");
  });

  it("imports SRT back to markers", () => {
    const srt = exportMarkersToSrt(markers);
    const imported = importSrtToMarkers(srt, "video.mp4");
    expect(imported).toHaveLength(4);
    expect(imported[0].kind).toBe("favorite");
    expect(imported[1].kind).toBe("negative");
    expect(imported[2].kind).toBe("inout");
    expect(imported[3].kind).toBe("note");
  });

  it("roundtrip preserves marker kinds", () => {
    const srt = exportMarkersToSrt(markers);
    const imported = importSrtToMarkers(srt, "video.mp4");
    const reExported = exportMarkersToSrt(imported);
    expect(reExported).toBe(srt);
  });

  it("returns empty string for empty markers", () => {
    expect(exportMarkersToSrt([])).toBe("");
  });

  it("returns empty array for empty SRT", () => {
    expect(importSrtToMarkers("", "video.mp4")).toEqual([]);
  });
});

describe("MARKER_PREFIX", () => {
  it("defines all 5 marker types", () => {
    expect(MARKER_PREFIX.FAVORITE).toBe("\u2605 ");
    expect(MARKER_PREFIX.NEGATIVE).toBe("\u2717 ");
    expect(MARKER_PREFIX.IN).toBe("\u21d2 ");
    expect(MARKER_PREFIX.OUT).toBe("\u2190 ");
    expect(MARKER_PREFIX.NOTE).toBe("\u00b7 ");
  });
});

describe("appendMarkerToSrt", () => {
  const baseMarker = {
    marker_id: "m1",
    kind: "favorite" as const,
    start_sec: 5,
    end_sec: 6,
    anchor_sec: 5.5,
    label: "Favorite",
    text: "Critical shot — keep",
    media_path: "video.mp4",
  };

  it("appends a marker to empty SRT", () => {
    const result = appendMarkerToSrt("", baseMarker);
    expect(result).toContain("00:00:05,000 --> 00:00:06,000");
    expect(result).toContain("\u2605 Favorite | Critical shot — keep");
    expect(result).toMatch(/^1\n/);
  });

  it("appends a marker to existing SRT with incrementing index", () => {
    const existing = "1\n00:00:01,000 --> 00:00:02,000\n\u00b7 Note text\n\n";
    const result = appendMarkerToSrt(existing, baseMarker);
    const blocks = result.trim().split(/\n\n+/);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatch(/^2\n/);
  });

  it("uses correct prefix per kind", () => {
    const map: Record<string, { kind: string; prefix: string }> = {
      favorite: { kind: "favorite", prefix: "\u2605 " },
      negative: { kind: "negative", prefix: "\u2717 " },
      in: { kind: "in", prefix: "\u21d2 " },
      out: { kind: "out", prefix: "\u2190 " },
      note: { kind: "note", prefix: "\u00b7 " },
    };
    for (const entry of Object.values(map)) {
      const result = appendMarkerToSrt("", { ...baseMarker, kind: entry.kind });
      expect(result).toContain(entry.prefix);
    }
  });

  it("handles marker without text", () => {
    const m = { ...baseMarker, text: "" };
    const result = appendMarkerToSrt("", m);
    expect(result).toContain("\u2605 Favorite");
    expect(result).not.toContain("|");
  });

  it("handles marker with pipe in text", () => {
    const m = { ...baseMarker, text: "shot A | shot B — keep" };
    const result = appendMarkerToSrt("", m);
    expect(result).toContain("| shot A | shot B — keep");
  });
});

describe("exportMarkersToSrtV2", () => {
  const baseMarker = {
    marker_id: "m1",
    kind: "favorite" as const,
    start_sec: 5,
    end_sec: 6,
    anchor_sec: 5.5,
    label: "Favorite",
    text: "Critical shot — keep",
    media_path: "video.mp4",
  };

  it("uses MARKER_PREFIX format for all kinds", () => {
    const allKinds = [
      { ...baseMarker, kind: "favorite" as const, label: "Best", text: "keep" },
      { ...baseMarker, kind: "negative" as const, label: "Bad", text: "remove" },
      { ...baseMarker, kind: "in" as const, label: "Start", text: "" },
      { ...baseMarker, kind: "out" as const, label: "End", text: "" },
      { ...baseMarker, kind: "note" as const, label: "Note", text: "remember" },
    ];
    const result = exportMarkersToSrtV2(allKinds);
    expect(result).toContain("\u2605 Best | keep");
    expect(result).toContain("\u2717 Bad | remove");
    expect(result).toContain("\u21d2 Start");
    expect(result).toContain("\u2190 End");
    expect(result).toContain("\u00b7 Note | remember");
  });

  it("returns empty string for empty list", () => {
    expect(exportMarkersToSrtV2([])).toBe("");
  });
});

interface TestProvisionalEvent {
  provisional_event_id: string;
  event_type: string;
  media_path: string;
  start_sec: number;
  end_sec: number;
  text: string;
  created_at: string;
  export_mode: string;
  migration_status: string;
  migrated_to_marker_id: string | null;
}

describe("exportToSidecar", () => {
  const markers = [
    {
      marker_id: "m1", kind: "favorite", start_sec: 5, end_sec: 6, anchor_sec: 5.5,
      label: "Best", text: "keep", media_path: "video.mp4", created_at: "2026-07-26T12:00:00Z",
    },
  ];
  const events: TestProvisionalEvent[] = [
    {
      provisional_event_id: "pe1", event_type: "vetka_logo_capture", media_path: "video.mp4",
      start_sec: 10, end_sec: 11, text: "Moment registered", created_at: "2026-07-26T12:00:01Z",
      export_mode: "srt_comment", migration_status: "local_only", migrated_to_marker_id: null,
    },
  ];

  it("produces valid JSON with sos_version", () => {
    const json = JSON.parse(exportToSidecar(markers, events, "video.mp4"));
    expect(json.sos_version).toBe("0.3");
    expect(json.source).toBe("cut_player");
    expect(json.media_path).toBe("video.mp4");
    expect(json.generated_at).toBeTruthy();
  });

  it("includes markers array", () => {
    const json = JSON.parse(exportToSidecar(markers, [], "video.mp4"));
    expect(json.markers).toHaveLength(1);
    expect(json.markers[0].kind).toBe("favorite");
    expect(json.markers[0].start_sec).toBe(5);
  });

  it("includes provisional_events array", () => {
    const json = JSON.parse(exportToSidecar([], events, "video.mp4"));
    expect(json.provisional_events).toHaveLength(1);
    expect(json.provisional_events[0].event_type).toBe("vetka_logo_capture");
  });

  it("reserves vision field as null", () => {
    const json = JSON.parse(exportToSidecar([], [], "video.mp4"));
    expect(json.vision).toBeNull();
  });

  it("handles empty markers and events", () => {
    const json = JSON.parse(exportToSidecar([], [], ""));
    expect(json.markers).toEqual([]);
    expect(json.provisional_events).toEqual([]);
  });
});

describe("exportMarkersToXml", () => {
  it("generates valid XML with markers", () => {
    const markers = [
      { marker_id: "m1", kind: "favorite", start_sec: 1.5, end_sec: 2.5, label: "good", text: "nice" },
      { marker_id: "m2", kind: "comment", start_sec: 10, end_sec: 11, label: "", text: "check this" },
    ];
    const xml = exportMarkersToXml(markers);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<cut_markers>");
    expect(xml).toContain("</cut_markers>");
    expect(xml).toContain("<id>m1</id>");
    expect(xml).toContain("<kind>favorite</kind>");
    expect(xml).toContain("<start_sec>1.500</start_sec>");
    expect(xml).toContain("<start_tc>00:00:01:13</start_tc>");
    expect(xml).toContain("<label>good</label>");
    expect(xml).toContain("<text>nice</text>");
    expect(xml).toContain("<text>check this</text>");
  });

  it("handles empty markers", () => {
    const xml = exportMarkersToXml([]);
    expect(xml).toContain("<!-- no markers -->");
  });

  it("escapes XML special characters", () => {
    const markers = [
      { marker_id: "m1", kind: "note", start_sec: 0, end_sec: 1, label: "a & b < c", text: 'say "hi"' },
    ];
    const xml = exportMarkersToXml(markers);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&quot;");
  });
});

describe("exportMarkersToXmeml", () => {
  const opts = {
    fps: 25,
    width: 1280,
    height: 720,
    durationSec: 20,
    sourcePath: "/tmp/cut16-test.mp4",
    sequenceName: "Review",
    hasAudio: true,
  };

  // [signal: xmeml v4 каркас] [project: cut-player]
  it("builds XMEML v4 with sequence directly under root", () => {
    const xml = exportMarkersToXmeml([], opts);
    expect(xml).toContain('<xmeml version="4">');
    expect(xml).toContain("<!DOCTYPE xmeml>");
    expect(xml).toContain("<sequence");
    expect(xml).not.toContain("<project>");
    expect(xml).toContain("<duration>500</duration>");
  });

  // [signal: pproTicks математика] [project: cut-player]
  it("computes pproTicks as frame * 254016000000 // timebase", () => {
    const xml = exportMarkersToXmeml([], opts);
    // full-length clip: in=0, out=500 frames @25fps
    expect(xml).toContain("<pproTicksIn>0</pproTicksIn>");
    expect(xml).toContain("<pproTicksOut>5080320000000</pproTicksOut>");
  });

  // [signal: точечный маркер out=-1] [project: cut-player]
  // 0.10.27: имя с label = глиф + label («★ good»).
  it("emits point markers with out=-1 inside clipitem", () => {
    const markers = [
      { marker_id: "m1", kind: "favorite", start_sec: 4, end_sec: 4, label: "good", text: "nice" },
    ];
    const xml = exportMarkersToXmeml(markers, opts);
    expect(xml).toContain("<marker>");
    expect(xml).toContain("<in>100</in>");
    expect(xml).toContain("<out>-1</out>");
    expect(xml).toContain("<name>★ good</name>");
    expect(xml).not.toContain("FAVORITEgood");
    expect(xml).toContain("file://localhost/tmp/cut16-test.mp4");
  });

  // [signal: in-out пары режутся в клипы] [project: cut-player]
  it("pairs in/out markers into timeline clips", () => {
    const markers = [
      { marker_id: "a", kind: "in", start_sec: 2, end_sec: 2, label: "", text: "" },
      { marker_id: "b", kind: "out", start_sec: 5, end_sec: 5, label: "", text: "" },
      { marker_id: "c", kind: "comment", start_sec: 10, end_sec: 10, label: "", text: "check" },
    ];
    const xml = exportMarkersToXmeml(markers, opts);
    expect(xml).toContain("<in>50</in>");
    expect(xml).toContain("<out>125</out>");
    expect(xml).toContain("<start>0</start>");
    expect(xml).toContain("<comment>check</comment>");
  });

  // [signal: нецелый fps → ntsc] [project: cut-player]
  it("marks ntsc TRUE for non-integer fps", () => {
    const xml = exportMarkersToXmeml([], { ...opts, fps: 23.976 });
    expect(xml).toContain("<timebase>24</timebase>");
    expect(xml).toContain("<ntsc>TRUE</ntsc>");
  });

  // [signal: 0.10.25 dims-фолбэк] [project: cut-player]
  it("falls back to naturalSize dims when probe is dead", () => {
    const xml = exportMarkersToXmeml([], { ...opts, width: 0, height: 0, naturalWidth: 1080, naturalHeight: 1920 });
    expect(xml).toContain("<width>1080</width>");
    expect(xml).toContain("<height>1920</height>");
    expect(xml).not.toContain("<width>1280</width>");
  });

  // [signal: 0.10.25 dims-фолбэк] [project: cut-player]
  it("prefers probe dims over naturalSize", () => {
    const xml = exportMarkersToXmeml([], { ...opts, width: 1920, height: 1080, naturalWidth: 1080, naturalHeight: 1920 });
    expect(xml).toContain("<width>1920</width>");
    expect(xml).toContain("<height>1080</height>");
  });

  // [signal: 0.10.27 имя с глифом] [project: cut-player]
  it("writes glyph+label names without kind-word doubling", () => {
    const markers = [
      { marker_id: "n1", kind: "negative", start_sec: 1, end_sec: 1, label: "Negative", text: "" },
      { marker_id: "f1", kind: "favorite", start_sec: 2, end_sec: 2, label: "Favorite", text: "" },
    ];
    const xml = exportMarkersToXmeml(markers, opts);
    expect(xml).toContain("<name>✗ Negative</name>");
    expect(xml).toContain("<name>★ Favorite</name>");
    expect(xml).not.toContain("NEGATIVENegative");
    expect(xml).not.toContain("FAVORITEFavorite");
  });

  // [signal: 0.10.27 pproColor] [project: cut-player]
  it("emits pproColor per kind (ABGR hypothesis from live Premiere file)", () => {
    const markers = [
      { marker_id: "n1", kind: "negative", start_sec: 1, end_sec: 1, label: "", text: "" },
      { marker_id: "f1", kind: "favorite", start_sec: 2, end_sec: 2, label: "", text: "" },
      { marker_id: "c1", kind: "comment", start_sec: 3, end_sec: 3, label: "", text: "hi" },
    ];
    const xml = exportMarkersToXmeml(markers, opts);
    expect(xml).toContain("<pproColor>4278190335</pproColor>");
    expect(xml).toContain("<pproColor>4278255360</pproColor>");
    expect(xml).toContain("<pproColor>4294901760</pproColor>");
  });

  // [signal: 0.10.25 префикс без label] [project: cut-player]
  it("keeps kind prefix when label is empty", () => {
    const markers = [
      { marker_id: "u1", kind: "favorite", start_sec: 1, end_sec: 1, label: "", text: "" },
    ];
    const xml = exportMarkersToXmeml(markers, opts);
    expect(xml).toContain("FAVORITEfavorite");
  });
});

// [signal: Bell №3 честный fps + аудио] [project: cut-player]
describe("resolveXmlFps", () => {
  it("prefers live probe fps", () => {
    expect(resolveXmlFps(30, 29.7)).toBe(30);
  });

  it("falls back to rVFC estimate when probe is dead", () => {
    expect(resolveXmlFps(null, 29.7)).toBe(29.7);
    expect(resolveXmlFps(0, 24)).toBe(24);
    expect(resolveXmlFps(-1, 24)).toBe(24);
  });

  it("defaults to 25 with no signal at all", () => {
    expect(resolveXmlFps(null, null)).toBe(25);
    expect(resolveXmlFps(undefined, undefined)).toBe(25);
  });
});

// EN-тост estimated fps: источник наружу — та же цепочка, что resolveXmlFps.
describe("resolveXmlFpsSource", () => {
  it("reports probe when the probe is alive", () => {
    expect(resolveXmlFpsSource(30, 29.7)).toBe("probe");
  });

  it("reports estimated when the probe is dead but rVFC has a value", () => {
    expect(resolveXmlFpsSource(null, 29.7)).toBe("estimated");
    expect(resolveXmlFpsSource(0, 24)).toBe("estimated");
    expect(resolveXmlFpsSource(-1, 24)).toBe("estimated");
  });

  it("reports fallback with no signal at all", () => {
    expect(resolveXmlFpsSource(null, null)).toBe("fallback");
    expect(resolveXmlFpsSource(undefined, undefined)).toBe("fallback");
    expect(resolveXmlFpsSource(0, -1)).toBe("fallback");
  });
});

describe("resolveXmlHasAudio", () => {
  it("trusts the element when it knows tracks", () => {
    expect(resolveXmlHasAudio(2, false, false)).toBe(true);
    expect(resolveXmlHasAudio(0, false, false)).toBe(false);
  });

  it("trusts a live probe when the element is mute about tracks", () => {
    expect(resolveXmlHasAudio(undefined, true, true)).toBe(true);
    expect(resolveXmlHasAudio(undefined, true, false)).toBe(false);
  });

  it("defaults to present with no signal — dropping real audio is worse", () => {
    expect(resolveXmlHasAudio(undefined, false, false)).toBe(true);
  });
});

// 0.12 слайс 1: взрослый таймкод HH:MM:SS:FF, всегда 11 знаков.
describe("formatTimecode", () => {
  it("formats zero and whole seconds", () => {
    expect(formatTimecode(0, 25)).toBe("00:00:00:00");
    expect(formatTimecode(61, 25)).toBe("00:01:01:00");
    expect(formatTimecode(3661, 25)).toBe("01:01:01:00");
  });

  it("derives frames from the fps chain value", () => {
    expect(formatTimecode(61.5, 25)).toBe("00:01:01:12");
    expect(formatTimecode(3661.5, 25)).toBe("01:01:01:12");
    expect(formatTimecode(10.5, 30)).toBe("00:00:10:15");
  });

  it("falls back to 25fps and zeros on garbage", () => {
    expect(formatTimecode(10.5, 0)).toBe("00:00:10:12");
    expect(formatTimecode(NaN, 25)).toBe("00:00:00:00");
    expect(formatTimecode(-3, 25)).toBe("00:00:00:00");
  });
});

// [signal: 0.18 playlist → XMEML] [project: cut-player]
describe("exportPlaylistToXmeml", () => {
  const mkItem = (over: Record<string, unknown> = {}) => ({
    sourcePath: "/tmp/a.mp4",
    clipName: "a",
    durationSec: 10,
    width: 1280,
    height: 720,
    hasAudio: true,
    markers: [],
    ...over,
  });

  it("keeps playlist order with per-file ids", () => {
    const xml = exportPlaylistToXmeml(
      [
        mkItem({ sourcePath: "/tmp/a.mp4", clipName: "a" }),
        mkItem({ sourcePath: "/tmp/b.mp4", clipName: "b" }),
      ],
      { fps: 25, seqWidth: 1280, seqHeight: 720, sequenceName: "Trip" },
    );
    expect(xml).toContain("<name>Trip</name>");
    const aPos = xml.indexOf("file://localhost/tmp/a.mp4");
    const bPos = xml.indexOf("file://localhost/tmp/b.mp4");
    expect(aPos).toBeGreaterThan(-1);
    expect(bPos).toBeGreaterThan(aPos);
    expect(xml).toContain('<file id="file-1">');
    expect(xml).toContain('<file id="file-2">');
    expect(xml).toContain("<masterclipid>masterclip-1</masterclipid>");
    expect(xml).toContain("<masterclipid>masterclip-2</masterclipid>");
  });

  it("accumulates timeline offsets from durations", () => {
    const xml = exportPlaylistToXmeml(
      [
        mkItem({ sourcePath: "/tmp/a.mp4", durationSec: 10 }),
        mkItem({ sourcePath: "/tmp/b.mp4", durationSec: 4 }),
      ],
      { fps: 25, seqWidth: 1280, seqHeight: 720, sequenceName: "Trip" },
    );
    // item1: full 250f at 0..250; item2 starts at 250, total 350.
    expect(xml).toContain("<start>0</start>");
    expect(xml).toContain("<start>250</start>");
    expect(xml).toContain("<duration>350</duration>");
  });

  it("cuts in/out per item in sequence frames", () => {
    const xml = exportPlaylistToXmeml(
      [
        mkItem({
          sourcePath: "/tmp/a.mp4",
          durationSec: 20,
          markers: [
            { marker_id: "i", kind: "in", start_sec: 2, end_sec: 2, label: "", text: "" },
            { marker_id: "o", kind: "out", start_sec: 5, end_sec: 5, label: "", text: "" },
          ],
        }),
        mkItem({ sourcePath: "/tmp/b.mp4", durationSec: 10 }),
      ],
      { fps: 25, seqWidth: 1280, seqHeight: 720, sequenceName: "Trip" },
    );
    expect(xml).toContain("<in>50</in>");
    expect(xml).toContain("<out>125</out>");
    // item1 contributes 75f, item2 full 250f → starts at 75, total 325.
    expect(xml).toContain("<start>75</start>");
    expect(xml).toContain("<duration>325</duration>");
  });

  it("uses sequence timebase and keeps marker colors per item", () => {
    const xml = exportPlaylistToXmeml(
      [
        mkItem({
          sourcePath: "/tmp/a.mp4",
          markers: [
            { marker_id: "f", kind: "favorite", start_sec: 1, end_sec: 1, label: "hit", text: "" },
          ],
        }),
      ],
      { fps: 30, seqWidth: 1280, seqHeight: 720, sequenceName: "Trip" },
    );
    expect(xml).toContain("<timebase>30</timebase>");
    expect(xml).toContain("<in>30</in>");
    expect(xml).toContain("<name>★ hit</name>");
    expect(xml).toContain("<pproColor>4278255360</pproColor>");
  });

  it("keeps audio in sync past a silent source", () => {
    const xml = exportPlaylistToXmeml(
      [
        mkItem({ sourcePath: "/tmp/a.mp4", durationSec: 10, hasAudio: false }),
        mkItem({ sourcePath: "/tmp/b.mp4", durationSec: 10, hasAudio: true }),
      ],
      { fps: 25, seqWidth: 1280, seqHeight: 720, sequenceName: "Trip" },
    );
    // silent item1 spans 0..250 with no audio clipitem; item2 audio starts at 250.
    expect(xml).toContain("<start>250</start>");
    expect(xml).not.toContain("<masterclipid>masterclip-1</masterclipid>\n\t\t\t\t\t\t<name>b");
  });

  it("emits a skeleton for an empty playlist", () => {
    const xml = exportPlaylistToXmeml(
      [],
      { fps: 25, seqWidth: 1280, seqHeight: 720, sequenceName: "Trip" },
    );
    expect(xml).toContain("<sequence");
    expect(xml).toContain("<!-- no sources -->");
    expect(xml).not.toContain("<clipitem");
  });
});

// [signal: 0.18 playlist metadata prescan] [project: cut-player]
describe("resolvePlaylistMetadata", () => {
  it("uses full seeds without calling the loader", async () => {
    let calls = 0;
    const out = await resolvePlaylistMetadata(
      ["/tmp/a.mp4"],
      { "/tmp/a.mp4": { durationSec: 10, width: 1280, height: 720 } },
      async () => { calls += 1; return null; },
    );
    expect(out["/tmp/a.mp4"]).toEqual({ durationSec: 10, width: 1280, height: 720 });
    expect(calls).toBe(0);
  });

  it("fills gaps from the loader, seed wins on conflict", async () => {
    const out = await resolvePlaylistMetadata(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      { "/tmp/a.mp4": { durationSec: 10 } },
      async (p) => (p === "/tmp/a.mp4"
        ? { durationSec: 99, width: 640, height: 480 }
        : { durationSec: 5, width: 1920, height: 1080 }),
    );
    expect(out["/tmp/a.mp4"]).toEqual({ durationSec: 10, width: 640, height: 480 });
    expect(out["/tmp/b.mp4"]).toEqual({ durationSec: 5, width: 1920, height: 1080 });
  });

  it("survives loader failure with zeros", async () => {
    const out = await resolvePlaylistMetadata(
      ["/tmp/gone.mp4"],
      {},
      async () => { throw new Error("unreadable"); },
    );
    expect(out["/tmp/gone.mp4"]).toEqual({ durationSec: 0, width: 0, height: 0 });
  });
});

// [signal: 0.19 review notes для людей] [project: cut-player]
describe("exportCommentsToText", () => {
  it("lists markers sorted with timecode, glyph and text", () => {
    const txt = exportCommentsToText(
      [
        { kind: "comment", start_sec: 17.5, end_sec: 17.5, label: "", text: "illustration from 6th second" },
        { kind: "favorite", start_sec: 4, end_sec: 4, label: "good", text: "" },
      ],
      25,
      "Review notes — clip.mp4",
    );
    const lines = txt.split("\n");
    expect(lines[0]).toBe("Review notes — clip.mp4");
    expect(lines[1]).toContain("00:00:04:00");
    expect(lines[1]).toContain("★ good");
    expect(lines[2]).toContain("00:00:17:12");
    expect(lines[2]).toContain("illustration from 6th second");
  });

  it("pairs in/out into Cut lines, lone in runs to end", () => {
    const txt = exportCommentsToText(
      [
        { kind: "in", start_sec: 2, end_sec: 2, label: "", text: "" },
        { kind: "out", start_sec: 5, end_sec: 5, label: "", text: "" },
        { kind: "in", start_sec: 40, end_sec: 40, label: "", text: "" },
      ],
      25,
    );
    expect(txt).toContain("Cut 00:00:02:00 → 00:00:05:00");
    expect(txt).toContain("Cut 00:00:40:00 → end");
  });

  it("shows real ranges, keeps default anchor halo a point", () => {
    const txt = exportCommentsToText(
      [
        { kind: "comment", start_sec: 29, end_sec: 40, label: "", text: "more illustration" },
        { kind: "comment", start_sec: 10, end_sec: 11, label: "", text: "halo" },
      ],
      25,
    );
    expect(txt).toContain("00:00:29:00 → 00:00:40:00 — comment: more illustration");
    expect(txt).toContain("00:00:10:00 — comment: halo");
  });

  it("drops stray out like the XML cutter does", () => {
    const txt = exportCommentsToText(
      [{ kind: "out", start_sec: 5, end_sec: 5, label: "", text: "" }],
      25,
    );
    expect(txt).toBe("");
  });

  it("stays EN-only", () => {
    const txt = exportCommentsToText(
      [{ kind: "negative", start_sec: 1, end_sec: 1, label: "", text: "fix it" }],
      25,
      "Review notes",
    );
    expect(/[а-яё]/i.test(txt)).toBe(false);
  });
});

describe("reviewMarkerName", () => {
  it("matches the XMEML naming: glyph+label, prefix only bare", () => {
    expect(reviewMarkerName("favorite", "good")).toBe("★ good");
    expect(reviewMarkerName("favorite", "")).toContain("FAVORITE");
    expect(reviewMarkerName("comment", "")).toContain("comment");
  });
});
