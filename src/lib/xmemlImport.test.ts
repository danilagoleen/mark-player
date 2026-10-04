import { describe, expect, it } from "vitest";
import { exportMarkersToXmeml, exportPlaylistToXmeml } from "../srtUtils";
import {
  decodeMarkerName,
  isSameImportedMarker,
  kindFromPproColor,
  matchGroupToPath,
  parseXmemlMarkers,
  pathFromPathUrl,
} from "./xmemlImport";

function mk(kind: string, start: number, end: number, label = "", text = "") {
  return { marker_id: `${kind}-${start}`, kind, start_sec: start, end_sec: end, label, text };
}

const OPTS = {
  fps: 25,
  width: 1920,
  height: 1080,
  durationSec: 120,
  sourcePath: "/Users/op/Movies/Интервью & 1.mov",
  hasAudio: true,
};

describe("parseXmemlMarkers: round-trip нашего экспорта", () => {
  // [signal: экспорт → импорт = те же маркеры] [project: cut-player]
  it("возвращает те же маркеры: вид, кадр, имя, комментарий", () => {
    const input = [
      mk("favorite", 4.5, 5.5, "good take"),
      mk("negative", 10.5, 11.5),
      mk("comment", 20.5, 21.5, "Fix", "Кириллица & <теги> \"кавычки\""),
    ];
    const res = parseXmemlMarkers(exportMarkersToXmeml(input, OPTS));
    expect(res.ok).toBe(true);
    expect(res.groups).toHaveLength(1);
    const [g] = res.groups;
    expect(g.name).toBe("Интервью & 1.mov");
    expect(g.path).toBe(OPTS.sourcePath);
    expect(g.fps).toBe(25);
    expect(g.markers.map((m) => [m.kind, m.label, m.text])).toEqual([
      ["favorite", "good take", ""],
      ["negative", "", ""],
      ["comment", "Fix", "Кириллица & <теги> \"кавычки\""],
    ]);
    // Экспорт округляет до кадра — импорт точен с допуском в полкадра.
    const halfFrame = 0.5 / 25 + 1e-9;
    input.forEach((src, i) => {
      expect(Math.abs(g.markers[i].start_sec - src.start_sec)).toBeLessThanOrEqual(halfFrame);
      expect(Math.abs(g.markers[i].end_sec - src.end_sec)).toBeLessThanOrEqual(halfFrame);
      expect(g.markers[i].anchor_sec).toBeCloseTo((g.markers[i].start_sec + g.markers[i].end_sec) / 2, 6);
    });
  });

  it("in/out-пара возвращается как точки in и out", () => {
    const res = parseXmemlMarkers(
      exportMarkersToXmeml([mk("in", 10, 10), mk("out", 30, 30), mk("favorite", 12, 13, "x")], OPTS),
    );
    const kinds = res.groups[0].markers.map((m) => [m.kind, m.start_sec]);
    expect(kinds).toEqual([["in", 10], ["favorite", 12], ["out", 30]]);
  });

  it("экспорт без нарезки не порождает in/out", () => {
    const res = parseXmemlMarkers(exportMarkersToXmeml([mk("favorite", 1, 2, "a")], OPTS));
    expect(res.groups[0].markers.map((m) => m.kind)).toEqual(["favorite"]);
  });

  it("маркеры, повторённые в каждом клипе нарезки, склеиваются в один", () => {
    const xml = exportMarkersToXmeml(
      [mk("in", 10, 10), mk("out", 20, 20), mk("in", 40, 40), mk("out", 50, 50), mk("comment", 15, 16, "c")],
      OPTS,
    );
    expect(xml.match(/<marker>/g)).toHaveLength(2);
    const res = parseXmemlMarkers(xml);
    const comments = res.groups[0].markers.filter((m) => m.kind === "comment");
    expect(comments).toHaveLength(1);
    expect(res.groups[0].markers.filter((m) => m.kind === "in")).toHaveLength(2);
    expect(res.groups[0].markers.filter((m) => m.kind === "out")).toHaveLength(2);
  });

  // tb_1790752061_6128_1 (а): экспорт в 29.97 считал кадры как sec*30 при
  // ntsc=TRUE — маркеры уезжали на +0.1%. Теперь сетка 30000/1001.
  it("29.97: кадры по сетке 30000/1001, round-trip в пределах полкадра", () => {
    const opts29 = { ...OPTS, fps: 29.97, durationSec: 3600 };
    const input = [
      mk("favorite", 60, 61, "hour"),
      mk("comment", 3599.5, 3600, "", "end"),
    ];
    const xml = exportMarkersToXmeml(input, opts29);
    expect(xml).toContain("<timebase>30</timebase>");
    expect(xml).toContain("<ntsc>TRUE</ntsc>");
    // 60 с → 1798 по сетке 30000/1001 (было 1800 по sec*30).
    expect(xml).toContain("<in>1798</in>");
    const res = parseXmemlMarkers(xml);
    expect(res.ok).toBe(true);
    const [g] = res.groups;
    expect(g.fps).toBeCloseTo(29.97, 2);
    expect(g.markers.map((m) => [m.kind, m.label, m.text])).toEqual([
      ["favorite", "hour", ""],
      ["comment", "", "end"],
    ]);
    const halfFrame = 0.5 / 29.97 + 1e-9;
    input.forEach((src, i) => {
      expect(Math.abs(g.markers[i].start_sec - src.start_sec)).toBeLessThanOrEqual(halfFrame);
      expect(Math.abs(g.markers[i].end_sec - src.end_sec)).toBeLessThanOrEqual(halfFrame);
    });
  });

  it("плейлист: по группе на каждый файл", () => {    const xml = exportPlaylistToXmeml(
      [
        { sourcePath: "/v/a.mov", clipName: "A", durationSec: 60, width: 1280, height: 720, hasAudio: false, markers: [mk("favorite", 1, 2, "fa")] },
        { sourcePath: "/v/b.mov", clipName: "B", durationSec: 90, width: 1280, height: 720, hasAudio: true, markers: [mk("negative", 3, 4, "nb"), mk("comment", 5, 6, "", "note")] },
      ],
      { fps: 25, seqWidth: 1280, seqHeight: 720, sequenceName: "PL" },
    );
    const res = parseXmemlMarkers(xml);
    expect(res.groups.map((g) => g.path)).toEqual(["/v/a.mov", "/v/b.mov"]);
    expect(res.groups[0].markers.map((m) => m.label)).toEqual(["fa"]);
    expect(res.groups[1].markers.map((m) => [m.kind, m.label, m.text])).toEqual([
      ["negative", "nb", ""],
      ["comment", "", "note"],
    ]);
  });
});

function xmemlWith(body: string, rate = "<timebase>25</timebase><ntsc>FALSE</ntsc>"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4"><sequence id="s"><rate>${rate}</rate><name>Seq</name><media><video><track>
${body}
</track></video></media></sequence></xmeml>`;
}

describe("parseXmemlMarkers: чужой XML (Premiere / DaVinci)", () => {
  it("точечный маркер out=-1 и имя без глифа: вид по цвету, label = имя", () => {
    const res = parseXmemlMarkers(
      xmemlWith(`<clipitem id="c1"><name>x</name><duration>500</duration><in>0</in><out>500</out>
        <file id="f1"><name>shot.mp4</name><pathurl>file://localhost/Volumes/A%20B/shot.mp4</pathurl><duration>500</duration></file>
        <marker><comment>loud</comment><name>Fix audio</name><in>50</in><out>-1</out><pproColor>4278190335</pproColor></marker>
        <marker><comment></comment><name>Nice</name><in>100</in><out>-1</out><pproColor>4278255360</pproColor></marker>
      </clipitem>`),
    );
    const g = res.groups[0];
    expect(g.path).toBe("/Volumes/A B/shot.mp4");
    expect(g.markers).toEqual([
      { kind: "negative", label: "Fix audio", text: "loud", start_sec: 2, end_sec: 2, anchor_sec: 2 },
      { kind: "favorite", label: "Nice", text: "", start_sec: 4, end_sec: 4, anchor_sec: 4 },
    ]);
  });

  it("NTSC: timebase 30 + ntsc TRUE читается как 30000/1001 кадр/с", () => {
    const res = parseXmemlMarkers(
      xmemlWith(
        `<clipitem id="c1"><duration>9000</duration><in>0</in><out>9000</out>
          <file id="f1"><name>n.mov</name><pathurl>file://localhost/n.mov</pathurl></file>
          <marker><name>m</name><in>30000</in><out>-1</out></marker>
        </clipitem>`,
        "<timebase>30</timebase><ntsc>TRUE</ntsc>",
      ),
    );
    expect(res.groups[0].fps).toBeCloseTo(29.97, 2);
    expect(res.groups[0].markers[0].start_sec).toBeCloseTo(1001, 3);
  });

  it("неизвестный цвет и отсутствие цвета — comment", () => {
    expect(kindFromPproColor(null)).toBe("comment");
    expect(kindFromPproColor(0xff80_40c0)).toBe("comment");
    expect(kindFromPproColor(4278190335)).toBe("negative");
    expect(kindFromPproColor(4278255360)).toBe("favorite");
    expect(kindFromPproColor(4294901760)).toBe("comment");
  });

  it("маркеры секвенса не привязываются к файлу, а считаются пропущенными", () => {
    const xml = xmemlWith(`<clipitem id="c1"><duration>500</duration><in>0</in><out>500</out>
        <file id="f1"><name>a.mov</name><pathurl>file://localhost/a.mov</pathurl></file>
      </clipitem>`).replace("</sequence>", "<marker><name>seq</name><in>10</in><out>-1</out></marker></sequence>");
    const res = parseXmemlMarkers(xml);
    expect(res.ok).toBe(true);
    expect(res.skippedSequenceMarkers).toBe(1);
    expect(res.groups).toEqual([]);
  });

  it("не XML, не XMEML и пустое — ok=false с понятной причиной", () => {
    expect(parseXmemlMarkers("").ok).toBe(false);
    expect(parseXmemlMarkers("<a><b></a>").ok).toBe(false);
    const other = parseXmemlMarkers("<root/>");
    expect(other.ok).toBe(false);
    expect(other.error).toMatch(/XMEML/);
  });
});

describe("decodeMarkerName / pathFromPathUrl", () => {
  it("глиф решает вид, слово-вид без подписи даёт пустой label", () => {
    expect(decodeMarkerName("★ good", null)).toEqual({ kind: "favorite", label: "good" });
    expect(decodeMarkerName("✗ Negative", null)).toEqual({ kind: "negative", label: "" });
    expect(decodeMarkerName("★ FAVORITE", 4278190335)).toEqual({ kind: "favorite", label: "" });
    expect(decodeMarkerName("· NOTE", null)).toEqual({ kind: "comment", label: "" });
    expect(decodeMarkerName("comment", null)).toEqual({ kind: "comment", label: "" });
    // tb_1790752061_6128_1: импорт узнаёт оба вида без label — старый
    // склеенный («✗ NEGATIVEnegative») и новый («✗ NEGATIVE»).
    expect(decodeMarkerName("✗ NEGATIVEnegative", null)).toEqual({ kind: "negative", label: "" });
    expect(decodeMarkerName("✗ NEGATIVE", null)).toEqual({ kind: "negative", label: "" });
  });

  it("pathurl: localhost, процент-кодирование, Windows-диск", () => {
    expect(pathFromPathUrl("file://localhost/Users/a/My%20Clip.mov")).toBe("/Users/a/My Clip.mov");
    expect(pathFromPathUrl("file:///Users/a/b.mov")).toBe("/Users/a/b.mov");
    expect(pathFromPathUrl("file://localhost/C:/clips/a.mov")).toBe("C:/clips/a.mov");
    expect(pathFromPathUrl("")).toBe("");
  });
});

describe("matchGroupToPath / isSameImportedMarker", () => {
  const cands = ["/a/one.mov", "/b/two.mov", "/c/two.mov"];
  it("точный путь, единственное имя, неоднозначность — null", () => {
    expect(matchGroupToPath({ name: "x", path: "/b/two.mov" }, cands)).toBe("/b/two.mov");
    expect(matchGroupToPath({ name: "One.MOV", path: "/elsewhere/One.MOV" }, cands)).toBe("/a/one.mov");
    expect(matchGroupToPath({ name: "two.mov", path: "/zzz/two.mov" }, cands)).toBeNull();
    expect(matchGroupToPath({ name: "none.mov", path: "" }, cands)).toBeNull();
  });

  it("тот же маркер: вид, место в полкадра, текст", () => {
    const inc = { kind: "comment" as const, start_sec: 10, end_sec: 11, anchor_sec: 10.5, label: "", text: "t" };
    expect(isSameImportedMarker({ kind: "comment", start_sec: 10.01, label: "Comment", text: "t" }, inc, 25)).toBe(true);
    expect(isSameImportedMarker({ kind: "comment", start_sec: 10.1, label: "Comment", text: "t" }, inc, 25)).toBe(false);
    expect(isSameImportedMarker({ kind: "favorite", start_sec: 10, label: "", text: "t" }, inc, 25)).toBe(false);
    expect(isSameImportedMarker({ kind: "comment", start_sec: 10, label: "", text: "other" }, inc, 25)).toBe(false);
  });
});
