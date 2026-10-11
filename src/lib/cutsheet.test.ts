import { describe, expect, it } from "vitest";
import {
  TICKS_PER_SECOND,
  parseCutsheet,
  resolveCutsheetForMedia,
  ticksToSeconds,
} from "./cutsheet";

// tb_1791333803_37784_1: превью монтажного листа одного видео.
// Тики ADR-06: 1/254016000000 с, целые, предел 2^53.

const MEDIA_KEY = "M1";
const REL_PATH = "subs_5s.mp4";

function sheetDoc(rows: unknown[], media?: Record<string, unknown>) {
  return JSON.stringify({
    schema: "vetka.cut.sheet/1",
    id: "sheet_test",
    title: "test",
    rev: 1,
    tick_rate: 254016000000,
    media: media ?? { [MEDIA_KEY]: { path: REL_PATH } },
    rows,
  });
}

function row(id: string, srcIn: number, srcOut: number, media = MEDIA_KEY) {
  return { id, n: 1, media, src_in: srcIn, src_out: srcOut };
}

const T = TICKS_PER_SECOND;

describe("parseCutsheet", () => {
  it("валидный лист одного медиа — ok", () => {
    const parsed = parseCutsheet(sheetDoc([row("r1", T * 1, T * 2), row("r2", T * 3, T * 4)]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.doc.rows).toHaveLength(2);
  });

  it("битый JSON — ошибка", () => {
    const parsed = parseCutsheet("{not json");
    expect(parsed.ok).toBe(false);
  });

  it("чужая схема — ошибка", () => {
    const parsed = parseCutsheet(sheetDoc([row("r1", T, T * 2)]).replace("vetka.cut.sheet/1", "vetka.cut.sheet/9"));
    expect(parsed.ok).toBe(false);
  });

  it("нет rows/media — ошибка", () => {
    expect(parseCutsheet(JSON.stringify({ schema: "vetka.cut.sheet/1" })).ok).toBe(false);
  });
});

describe("ticksToSeconds", () => {
  it("50 fps: кадр = 5080320000 тиков ровно", () => {
    expect(ticksToSeconds(5080320000)).toBeCloseTo(0.02, 12);
  });

  it("29.97: 10 кадров — точная граница", () => {
    // кадр 30000/1001: 254016000000*1001/30000 = 8475667200 тиков
    expect(ticksToSeconds(8475667200 * 10)).toBeCloseTo((10 * 1001) / 30000, 9);
  });
});

describe("resolveCutsheetForMedia", () => {
  const openAbs = "/order/sd1/subs_5s.mp4";
  const sheetDir = "/order/sd1";

  function resolve(text: string, openPath = openAbs, dir = sheetDir) {
    const parsed = parseCutsheet(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("fixture invalid");
    return resolveCutsheetForMedia(parsed.doc, dir, openPath);
  }

  it("строки одного медиа → сегменты в секундах, по порядку", () => {
    const res = resolve(sheetDoc([row("r2", T * 3, T * 4), row("r1", T * 1, T * 2)]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.segments).toEqual([{ start: 1, end: 2 }, { start: 3, end: 4 }]);
  });

  it("совпадение по имени файла (браузер: открыт blob, ключ — имя)", () => {
    const res = resolve(sheetDoc([row("r1", T, T * 2)]), "subs_5s.mp4", "/other/dir");
    expect(res.ok).toBe(true);
  });

  it("лист на два файла — multi, ничего не играет", () => {
    const res = resolve(
      sheetDoc([row("r1", T, T * 2, "M1"), row("r2", T, T * 2, "M2")], {
        M1: { path: "a.mp4" },
        M2: { path: "b.mp4" },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("multi-media");
  });

  it("чужое видео — foreign с обоими путями", () => {
    const res = resolve(sheetDoc([row("r1", T, T * 2)]), "/order/sd1/other.mp4");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("foreign-media");
      expect(res.sheetPath).toContain("subs_5s.mp4");
      expect(res.openPath).toContain("other.mp4");
    }
  });

  it("нецелые тики — ошибка без округления", () => {
    const res = resolve(sheetDoc([{ ...row("r1", T, T * 2), src_in: T + 0.5 }]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("bad-ticks");
  });

  it("тики больше 2^53 — ошибка", () => {
    const big = 2 ** 53 + 1000;
    const res = resolve(sheetDoc([row("r1", T, big)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("bad-ticks");
  });

  it("out <= in — ошибка строки", () => {
    const res = resolve(sheetDoc([row("r1", T * 2, T * 2)]));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("bad-row");
  });

  it("пересекающиеся строки сливаются", () => {
    const res = resolve(sheetDoc([row("r1", T * 1, T * 3), row("r2", T * 2, T * 4)]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.segments).toEqual([{ start: 1, end: 4 }]);
  });
});
