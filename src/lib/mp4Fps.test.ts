import { describe, expect, it } from "vitest";
import { loadContainerFps, moovStatus, parseMp4Fps, type RangeFetch } from "./mp4Fps";

// Синтетический ISO BMFF: боксы собираем руками, без фикстур-файлов.

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
}

function ftyp(): Uint8Array {
  return box("ftyp", concat(ascii("isom"), u32(0), ascii("isom"), ascii("iso2")));
}

// mdhd v0: version/flags, creation, modification, timescale, duration, lang, quality.
// v1: те же поля, но creation/modification/duration по 8 байт.
// mdhd строго по спеке ISO BMFF: v0 — version/flags(4), creation(4),
// modification(4), timescale(4), duration(4), language(2), quality(2);
// v1 — creation/modification/duration по 8 байт.
// (tb_1790819984_60841_2: билдер повторял ошибку ридера +8 и тесты были
// самосогласованно-зелёными — теперь строго по спеке.)
function mdhd(timescale: number, version = 0, creation = 0): Uint8Array {
  const head = version === 1
    ? concat(new Uint8Array([1, 0, 0, 0]), new Uint8Array(16), u32(timescale), u32(0), u32(timescale * 100), new Uint8Array(4))
    : concat(new Uint8Array(4), u32(creation), new Uint8Array(4), u32(timescale), u32(timescale * 100), new Uint8Array(4));
  return box("mdhd", head);
}

function hdlr(handler: string): Uint8Array {
  return box("hdlr", concat(new Uint8Array(8), ascii(handler), new Uint8Array(12)));
}

function stts(entries: [number, number][]): Uint8Array {
  const body = concat(new Uint8Array(4), u32(entries.length));
  const parts = [body];
  for (const [count, delta] of entries) parts.push(concat(u32(count), u32(delta)));
  return box("stts", concat(...parts));
}

function videoTrak(timescale: number, entries: [number, number][], handler = "vide"): Uint8Array {
  return box("trak", concat(
    box("tkhd", new Uint8Array(8)),
    box("mdia", concat(
      mdhd(timescale),
      hdlr(handler),
      box("minf", concat(box("stbl", stts(entries)))),
    )),
  ));
}

function mp4(...moovKids: Uint8Array[]): Uint8Array {
  return concat(ftyp(), box("moov", concat(...moovKids, box("mvhd", new Uint8Array(8)))));
}

describe("parseMp4Fps", () => {
  it("CFR 25: timescale 12800, delta 512", () => {
    expect(parseMp4Fps(mp4(videoTrak(12800, [[300, 512]])))).toEqual({ fps: 25, variable: false });
  });

  it("mdhd v0 с ненулевым creation_time — читаем timescale, а не creation", () => {
    const trak = box("trak", concat(
      box("mdia", concat(
        mdhd(30000, 0, 0x3a2f_5b00),
        hdlr("vide"),
        box("minf", concat(box("stbl", stts([[900, 1001]])))),
      )),
    ));
    expect(parseMp4Fps(mp4(trak))).toEqual({ fps: 30000 / 1001, variable: false });
  });

  it("29.97: timescale 30000, delta 1001", () => {
    const r = parseMp4Fps(mp4(videoTrak(30000, [[900, 1001]])));
    expect(r).not.toBeNull();
    expect(r!.fps).toBeCloseTo(29.97003, 4);
    expect(r!.variable).toBe(false);
  });

  it("23.976: timescale 24000, delta 1001", () => {
    expect(parseMp4Fps(mp4(videoTrak(24000, [[240, 1001]])))!.fps).toBeCloseTo(23.97602, 4);
  });

  it("VFR: две длительности — средний fps + флаг variable", () => {
    const r = parseMp4Fps(mp4(videoTrak(30000, [[100, 1001], [100, 2002]])));
    expect(r).not.toBeNull();
    expect(r!.variable).toBe(true);
    expect(r!.fps).toBeCloseTo(30000 / 1501.5, 4);
  });

  it("аудиодорожка первой — берётся video по hdlr", () => {
    const file = mp4(videoTrak(44100, [[441, 1024]], "soun"), videoTrak(25, [[250, 1]]));
    expect(parseMp4Fps(file)).toEqual({ fps: 25, variable: false });
  });

  it("без hdlr — первая дорожка со stts", () => {
    const trak = box("trak", concat(
      box("mdia", concat(mdhd(50), box("minf", concat(box("stbl", stts([[500, 1]])))))),
    ));
    expect(parseMp4Fps(mp4(trak))).toEqual({ fps: 50, variable: false });
  });

  it("mdhd version 1 (64-бит) читается", () => {
    const trak = box("trak", concat(
      box("mdia", concat(mdhd(600, 1), hdlr("vide"), box("minf", concat(box("stbl", stts([[600, 20]])))))),
    ));
    expect(parseMp4Fps(trak ? mp4(trak) : new Uint8Array())).toEqual({ fps: 30, variable: false });
  });

  it("мусор и не-MP4 → null", () => {
    expect(parseMp4Fps(new Uint8Array())).toBeNull();
    expect(parseMp4Fps(ascii("RIFF....AVI LIST"))).toBeNull();
    expect(parseMp4Fps(concat(ascii("...."), ascii("mdat"), new Uint8Array(100)))).toBeNull();
  });

  it("обрезанный moov → null (не гадаем)", () => {
    const full = mp4(videoTrak(12800, [[300, 512]]));
    expect(parseMp4Fps(full.slice(0, 40))).toBeNull();
  });
});

describe("moovStatus", () => {
  it("complete / partial / absent", () => {
    const full = mp4(videoTrak(12800, [[300, 512]]));
    expect(moovStatus(full)).toBe("complete");
    expect(moovStatus(full.slice(0, 40))).toBe("partial");
    expect(moovStatus(concat(ftyp(), box("mdat", new Uint8Array(100))))).toBe("absent");
  });
});

describe("loadContainerFps", () => {
  const file = mp4(videoTrak(30000, [[900, 1001]]));

  it("moov в голове — один запрос", async () => {
    let calls = 0;
    const rf: RangeFetch = async () => { calls += 1; return { bytes: file, total: file.length, partial: true }; };
    const r = await loadContainerFps("http://x/a.mov", rf);
    expect(r!.fps).toBeCloseTo(29.97, 2);
    expect(calls).toBe(1);
  });

  it("moov в хвосте — добирает tail по total из Content-Range", async () => {
    const headOnly = concat(ftyp(), box("mdat", new Uint8Array(64)));
    const tail = concat(box("moov", concat(videoTrak(12800, [[300, 512]]), box("mvhd", new Uint8Array(8)))), new Uint8Array(16));
    const total = headOnly.length + 100 + tail.length;
    // Маленький файл: хвост считается от 0 — различаем вызовы по порядку.
    let n = 0;
    const rf: RangeFetch = async () => {
      n += 1;
      return n === 1 ? { bytes: headOnly, total, partial: true } : { bytes: tail, total, partial: true };
    };
    const r = await loadContainerFps("http://x/b.mov", rf);
    expect(r).toEqual({ fps: 25, variable: false });
  });

  it("сервер без Range (200) — парсит тело целиком", async () => {
    const rf: RangeFetch = async () => ({ bytes: file, total: file.length, partial: false });
    expect((await loadContainerFps("blob:x", rf))!.fps).toBeCloseTo(29.97, 2);
  });

  it("сеть легла — null без исключений", async () => {
    const rf: RangeFetch = async () => null;
    await expect(loadContainerFps("http://x/c.mov", rf)).resolves.toBeNull();
    await expect(loadContainerFps("")).resolves.toBeNull();
  });
});
