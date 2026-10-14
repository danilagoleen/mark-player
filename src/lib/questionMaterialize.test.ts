import { describe, expect, it } from "vitest";
import {
  agentAuthorFor,
  countMaterializable,
  filterNewMarkers,
  formatRegionSuffix,
  markerDedupKey,
  materializePlaylistQuestions,
  materializeQuestionEntry,
  materializedMarkerId,
  materializedMarkerPrefix,
  MATERIALIZED_LABEL_MAX,
  type MaterializedMarker,
  type QuestionMaterializeIO,
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
    expect(filterNewMarkers(new Set(a.map((m) => markerDedupKey(m.marker_id, m.media_path, m.anchor_sec))), b)).toHaveLength(0);
  });

  it("tb_1791861762_84020_3: те же question_id на другом видео — новые маркеры", () => {
    const entry = { question_id: "q03", in_sec: 1, out_sec: 2, markers: [] };
    const otherCtx = { ...CTX, mediaPath: "asset://other.mov" };
    const a = materializeQuestionEntry(entry, CTX);
    const b = materializeQuestionEntry(entry, otherCtx);
    expect(a.map((m) => m.marker_id)).toEqual(b.map((m) => m.marker_id));
    expect(filterNewMarkers(new Set(a.map((m) => markerDedupKey(m.marker_id, m.media_path, m.anchor_sec))), b)).toHaveLength(b.length);
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

// tb_1791840835_63972_1: общая материализация на оба пути импорта.
describe("materializePlaylistQuestions", () => {
  const QP = {
    entries: [
      { question_id: "mrg-01", question: "Один?", in_sec: 1, out_sec: 2, path: "a.mp4" },
      { question_id: "mrg-02", question: "Два?", in_sec: 3, out_sec: 4, path: "a.mp4" },
    ],
  };
  function fakeIO(stored: MaterializedMarker[] = []): QuestionMaterializeIO & { appended: MaterializedMarker[]; notified: number } {
    const keys = new Set(stored.map((m) => markerDedupKey(m.marker_id, m.media_path, m.anchor_sec)));
    const io = {
      appended: [] as MaterializedMarker[],
      notified: 0,
      readStoredKeys: () => keys,
      appendMarkers: (ms: MaterializedMarker[]) => { io.appended.push(...ms); },
      resolveMediaUrl: async (p: string) => `asset://${p}`,
      notifyChanged: () => { io.notified += 1; },
    };
    return io;
  }
  it("вопросы → маркеры + строка статуса с именем файла", async () => {
    const io = fakeIO();
    const line = await materializePlaylistQuestions(QP as never, "cap.json", io, "2026-10-12T00:00:00Z");
    expect(io.appended.length).toBeGreaterThan(0);
    expect(io.notified).toBe(1);
    expect(line).toContain("cap.json");
    expect(line).toContain("2 questions");
    expect(line).not.toContain("undefined");
    for (const m of io.appended) expect(m.media_path).toBe("asset://a.mp4");
  });
  it("повтор — без дублей, строка already", async () => {
    const io = fakeIO();
    await materializePlaylistQuestions(QP as never, "cap.json", io);
    const before = io.appended.length;
    for (const m of io.appended) io.readStoredKeys().add(markerDedupKey(m.marker_id, m.media_path, m.anchor_sec));
    const line = await materializePlaylistQuestions(QP as never, "cap.json", io);
    expect(io.appended.length).toBe(before);
    expect(line).toContain("already in markers");
  });
  it("не вопрос-плейлист — только счётчик записей", async () => {
    const io = fakeIO();
    const line = await materializePlaylistQuestions({ entries: [{ path: "a.mp4" }] } as never, "plain.json", io);
    expect(line).toBe("Loaded plain.json: 1 entries.");
    expect(io.appended).toHaveLength(0);
    expect(io.notified).toBe(0);
  });
  it("запись без path считается вопросом, но маркеров не даёт", async () => {
    const io = fakeIO();
    const line = await materializePlaylistQuestions(
      { entries: [{ question_id: "q1", question: "Без пути" }] } as never,
      "nopath.json",
      io,
    );
    expect(line).toContain("1 questions already in markers");
    expect(io.appended).toHaveLength(0);
  });
  it("tb_1791861762_84020_3: новый файл поверх открытого (те же qid, другое видео) — маркеры есть", async () => {
    const io = fakeIO();
    await materializePlaylistQuestions(QP as never, "first.json", io);
    const before = io.appended.length;
    expect(before).toBeGreaterThan(0);
    for (const m of io.appended) io.readStoredKeys().add(markerDedupKey(m.marker_id, m.media_path, m.anchor_sec));
    const QP2 = {
      entries: [
        { question_id: "mrg-01", question: "Один?", in_sec: 1, out_sec: 2, path: "b.mp4" },
        { question_id: "mrg-02", question: "Два?", in_sec: 3, out_sec: 4, path: "b.mp4" },
      ],
    };
    const line = await materializePlaylistQuestions(QP2 as never, "second.json", io);
    expect(io.appended.length).toBeGreaterThan(before);
    expect(line).toContain("2 questions →");
    for (const m of io.appended.slice(before)) expect(m.media_path).toBe("asset://b.mp4");
  });
});

describe("tb_1791885959_77379_1: сиблинги одного path+qid не режутся дедупом", () => {
  const io = (): QuestionMaterializeIO & { appended: MaterializedMarker[] } => {
    const box: QuestionMaterializeIO & { appended: MaterializedMarker[] } = {
      appended: [],
      readStoredKeys: () => new Set(box.appended.map((m) => markerDedupKey(m.marker_id, m.media_path, m.anchor_sec))),
      appendMarkers: (fresh) => { box.appended.push(...fresh); },
      resolveMediaUrl: async (p) => `asset://${p}`,
      notifyChanged: () => {},
    };
    return box;
  };
  it("trk-10 A/B (один qid, один файл, разные окна) — оба окна + оба коммента", async () => {
    const qp = {
      schema: "vetka.cut.question_playlist/1",
      entries: [
        { path: "/v/big.mov", question_id: "trk-10", in_sec: 104.75, out_sec: 107.75, markers: [{ kind: "comment", t_sec: 106.25, text: "A" }] },
        { path: "/v/big.mov", question_id: "trk-10", in_sec: 2919.75, out_sec: 2922.75, markers: [{ kind: "comment", t_sec: 2921.25, text: "B" }] },
      ],
    };
    const store = io();
    const line = await materializePlaylistQuestions(qp as never, "cap.json", store, "2026-10-13T00:00:00Z");
    expect(line).toMatch(/6 markers/);
    const anchors = store.appended.map((m) => m.anchor_sec).sort((a, b) => (a as number) - (b as number));
    expect(anchors).toEqual([104.75, 106.25, 107.75, 2919.75, 2921.25, 2922.75]);
  });
  it("повторный импорт того же — ноль свежих (якорь в ключе работает)", async () => {
    const qp = {
      schema: "vetka.cut.question_playlist/1",
      entries: [
        { path: "/v/big.mov", question_id: "trk-10", in_sec: 104.75, out_sec: 107.75, markers: [] },
      ],
    };
    const store = io();
    await materializePlaylistQuestions(qp as never, "cap.json", store, "2026-10-13T00:00:00Z");
    expect(store.appended).toHaveLength(2);
    const line2 = await materializePlaylistQuestions(qp as never, "cap.json", store, "2026-10-13T00:00:00Z");
    expect(line2).toMatch(/already in markers/);
    expect(store.appended).toHaveLength(2);
  });
});
