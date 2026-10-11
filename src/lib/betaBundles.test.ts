import { describe, expect, it } from "vitest";
import {
  betaDirectCandidates,
  calibrationToPlaylist,
  importBetaBundleText,
  isBetaCalibration,
  isBetaSceneProposals,
  proposalsToPlaylist,
} from "./betaBundles";

const CAL = {
  layer: "camera_calibration",
  tool: "cut_player_camera_calibration",
  n: 2,
  questions: [
    {
      id: "C001",
      file: "P1755185.MOV",
      shot: "S0001",
      start: 16.0,
      end: 18.5,
      candidate: { type: "truck", direction: "right", confidence: 0.26, basis: "heuristic" },
      answer: { type: null },
    },
    {
      id: "C002",
      file: "P1755186.MOV",
      shot: "S0002",
      start: 4,
      end: 9,
      candidate: null,
      answer: null,
    },
    { id: "C003" },
  ],
};

const PRO = {
  tool: "scene_triager",
  status: "proposed",
  scenes: [
    { id: "SC_prep", label: "зал и подготовка", files: ["P1744781.MOV", "P1744782.MOV"], basis: "shoot order" },
    { id: "SC_empty", label: "пустая", files: [] },
  ],
};

describe("isBetaCalibration", () => {
  it("узнаёт калибровку", () => {
    expect(isBetaCalibration(CAL)).toBe(true);
  });
  it("плейлист и мусор — не калибровка", () => {
    expect(isBetaCalibration({ entries: [] })).toBe(false);
    expect(isBetaCalibration(null)).toBe(false);
    expect(isBetaCalibration({ questions: [] })).toBe(false);
  });
});

describe("isBetaSceneProposals", () => {
  it("узнаёт пачку сцен", () => {
    expect(isBetaSceneProposals(PRO)).toBe(true);
  });
  it("плейлист и мусор — не пачка", () => {
    expect(isBetaSceneProposals({ entries: [] })).toBe(false);
    expect(isBetaSceneProposals({ scenes: [] })).toBe(false);
  });
});

describe("betaDirectCandidates", () => {
  it("файл рядом + proxy внутри", () => {
    expect(betaDirectCandidates("/a/index", "P1.MOV")).toEqual(["/a/index/P1.MOV", "/a/index/P1.MOV/proxy.mp4"]);
  });
  it("без baseDir — голое имя", () => {
    expect(betaDirectCandidates("", "P1.MOV")).toEqual(["P1.MOV"]);
  });
});

describe("calibrationToPlaylist", () => {
  it("вопросы → записи со скобками и choices", () => {
    const seen: string[] = [];
    const pl = calibrationToPlaylist(CAL, (bare) => {
      seen.push(bare);
      return `/src/${bare}`;
    });
    expect(pl.schema).toBe("vetka.cut.question_playlist/1");
    expect(pl.entries).toHaveLength(2);
    expect(seen).toEqual(["P1755185.MOV", "P1755186.MOV"]);
    const [a, b] = pl.entries;
    expect(a.question_id).toBe("C001");
    expect(a.path).toBe("/src/P1755185.MOV");
    expect(a.in_sec).toBe(16.0);
    expect(a.out_sec).toBe(18.5);
    expect(a.choices).toContain("truck");
    expect(a.question).toContain("S0001");
    expect(a.hypothesis).toContain("truck right (0.26)");
    expect(b.hypothesis).toBeUndefined();
    expect(b.in_sec).toBe(4);
  });
});

describe("importBetaBundleText", () => {
  it("калибровка без fs — тождественный резолв", async () => {
    const pl = await importBetaBundleText(JSON.stringify(CAL), null);
    expect(pl?.schema).toBe("vetka.cut.question_playlist/1");
    expect(pl?.entries).toHaveLength(2);
    expect(pl?.entries[0].path).toBe("P1755185.MOV");
  });
  it("пачка сцен без fs — представитель первым файлом", async () => {
    const pl = await importBetaBundleText(JSON.stringify(PRO), null);
    expect(pl?.entries).toHaveLength(1);
    expect(pl?.entries[0].path).toBe("P1744781.MOV");
  });
  it("плейлист, мусор и битый JSON — null", async () => {
    expect(await importBetaBundleText(JSON.stringify({ entries: [] }), null)).toBeNull();
    expect(await importBetaBundleText("{}", null)).toBeNull();
    expect(await importBetaBundleText("not json", null)).toBeNull();
  });
});

describe("proposalsToPlaylist", () => {
  it("сцены → записи с представителем и триажем", () => {
    const pl = proposalsToPlaylist(PRO, (bare) => `/src/${bare}`);
    expect(pl.schema).toBe("vetka.cut.question_playlist/1");
    expect(pl.entries).toHaveLength(1);
    const [a] = pl.entries;
    expect(a.question_id).toBe("SC_prep");
    expect(a.path).toBe("/src/P1744781.MOV");
    expect(a.choices).toEqual(["confirm", "split", "rename"]);
    expect(a.question).toContain("зал и подготовка");
    expect(a.question).toContain("2 файлов");
    expect(a.in_sec).toBeUndefined();
  });
});
