import { describe, expect, it } from "vitest";
import {
  agentAuthorFor,
  countMaterializable,
  filterNewMarkers,
  formatRegionSuffix,
  materializeQuestionEntry,
  materializedMarkerId,
  materializedMarkerPrefix,
  MATERIALIZED_LABEL_MAX,
} from "./questionMaterialize";

const CTX = { mediaPath: "asset://video.mov", author: "agent:Beta", now: "2026-10-10T00:00:00.000Z" };

describe("questionMaterialize (tb_1791586270_32802_2)", () => {
  it("запись → in + out + comment с автором agent:<роль>", () => {
    const markers = materializeQuestionEntry(
      {
        question_id: "q03",
        question: "План общий?",
        hypothesis: "FS, камера A",
        in_sec: 12.5,
        out_sec: 18,
        markers: [{ kind: "comment", t_sec: 14, text: "граница плана" }],
      },
      CTX,
    );
    expect(markers).toHaveLength(3);
    const [inM, outM, cM] = markers;
    expect(inM.kind).toBe("in");
    expect(inM.start_sec).toBe(12.5);
    expect(outM.kind).toBe("out");
    expect(outM.start_sec).toBe(18);
    expect(cM.kind).toBe("comment");
    expect(cM.start_sec).toBe(14);
    for (const m of markers) {
      expect(m.author).toBe("agent:Beta");
      expect(m.media_path).toBe("asset://video.mov");
      expect(m.schema_version).toBe("cut_time_marker_v1");
      expect("status" in m).toBe(false);
    }
    expect(cM.label).toBe("План общий?");
    expect(cM.text).toBe("FS, камера A — граница плана");
  });

  it("id детерминированы (повтор не плодит дубли)", () => {
    const entry = { question_id: "q03", in_sec: 1, out_sec: 2, markers: [] };
    const a = materializeQuestionEntry(entry, CTX);
    const b = materializeQuestionEntry(entry, CTX);
    expect(a.map((m) => m.marker_id)).toEqual(b.map((m) => m.marker_id));
    expect(filterNewMarkers(new Set(a.map((m) => m.marker_id)), b)).toHaveLength(0);
  });

  it("без question_id — пусто", () => {
    expect(materializeQuestionEntry({ in_sec: 1, out_sec: 2 }, CTX)).toEqual([]);
  });

  it("ломаный out (<=in) пропускается, in и комменты пишутся", () => {
    const markers = materializeQuestionEntry(
      { question_id: "q1", in_sec: 5, out_sec: 5, markers: [{ kind: "comment", t_sec: 5 }] },
      CTX,
    );
    expect(markers.map((m) => m.kind)).toEqual(["in", "comment"]);
  });

  it("неизвестный kind маркера → comment", () => {
    const markers = materializeQuestionEntry(
      { question_id: "q1", markers: [{ kind: "wat", t_sec: 1 } as never] },
      CTX,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].kind).toBe("comment");
  });

  it("agentAuthorFor: by → agent:<by>, пусто → agent:agent", () => {
    expect(agentAuthorFor("Beta")).toBe("agent:Beta");
    expect(agentAuthorFor("agent:Beta")).toBe("agent:Beta");
    expect(agentAuthorFor("")).toBe("agent:agent");
    expect(agentAuthorFor(undefined)).toBe("agent:agent");
  });

  it("countMaterializable считает только записи с question_id", () => {
    expect(countMaterializable([{ question_id: "a" }, { path: "x" }, null])).toBe(1);
  });

  it("materializedMarkerId чистит мусор из question_id", () => {
    expect(materializedMarkerId("cam q/03!", "in")).toBe("qmat_cam-q-03_in");
  });

  it("materializedMarkerPrefix — префикс поиска родителя ответа", () => {
    expect(materializedMarkerPrefix("cam q/03!")).toBe("qmat_cam-q-03_");
    expect(materializedMarkerId("q1", "in").startsWith(materializedMarkerPrefix("q1"))).toBe(true);
  });
});

describe("questionMaterialize bbox (tb_1791754893_1275_4)", () => {
  const BOX = { x: 0.31, y: 0.22, w: 0.18, h: 0.24 };
  const BOX_END = { x: 0.33, y: 0.23, w: 0.18, h: 0.24 };
  it("formatRegionSuffix: статика и трек", () => {
    expect(formatRegionSuffix(undefined)).toBe("");
    expect(formatRegionSuffix(BOX)).toBe(" [region 0.310,0.220,0.180,0.240]");
    expect(formatRegionSuffix(BOX, BOX_END)).toBe(" [region 0.310,0.220,0.180,0.240 → 0.330,0.230,0.180,0.240]");
  });
  it("регион едет текстом в in/out (экспорт видит, Premiere читает)", () => {
    const markers = materializeQuestionEntry(
      { question_id: "pq1", question: "Кто это?", in_sec: 5, out_sec: 9, bbox: BOX, bbox_end: BOX_END },
      CTX,
    );
    expect(markers.map((m) => m.kind)).toEqual(["in", "out"]);
    expect(markers[0].text).toBe("Кто это? [region 0.310,0.220,0.180,0.240 → 0.330,0.230,0.180,0.240]");
    expect(markers[1].text).toContain("[region");
  });
  it("без bbox — суффикса нет, текст чистый", () => {
    const markers = materializeQuestionEntry({ question_id: "pq2", question: "Кто?", in_sec: 1, out_sec: 2 }, CTX);
    expect(markers[0].text).toBe("Кто?");
  });
  it(`label режется на ${MATERIALIZED_LABEL_MAX} (манифест §5.1)`, () => {
    expect(MATERIALIZED_LABEL_MAX).toBe(80);
    const long = "x".repeat(200);
    const markers = materializeQuestionEntry({ question_id: long, question: long, in_sec: 1, out_sec: 2 }, CTX);
    for (const m of markers) expect(m.label.length).toBeLessThanOrEqual(80);
  });
  it("tb_1791809796_24701_1: каждый маркер несёт question_id полем", () => {
    const markers = materializeQuestionEntry(
      { question_id: "mrg-01", question: "Кто?", in_sec: 1, out_sec: 2, markers: [{ kind: "comment", t_sec: 1.5 }] },
      CTX,
    );
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) expect(m.question_id).toBe("mrg-01");
  });
});
