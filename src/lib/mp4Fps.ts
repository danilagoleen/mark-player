// Точный fps из заголовка MP4/MOV без FFprobe (tb_1790752061_6128_1).
// Цепочка была probe → rVFC-оценка → 25; probe в релизе мёртв, оценка на
// E2E давала 46 вместо 50. Контейнер — первое звено: moov/trak/mdia/mdhd
// даёт timescale, stts — длительности сэмплов видеодорожки.
// Читаем только голову и хвост файла (moov бывает в конце), без зависимостей.

export interface ContainerFps {
  fps: number;
  // VFR: в stts больше одной длительности — fps средний, честно помечаем.
  variable: boolean;
}

interface Box {
  type: string;
  // Содержимое бокса (после заголовка), [start, end) в байтах данных.
  start: number;
  end: number;
  // Полный бокс обрезан буфером.
  truncated: boolean;
}

function readU32(d: Uint8Array, off: number): number {
  return d[off] * 0x1000000 + (d[off + 1] << 16) + (d[off + 2] << 8) + d[off + 3];
}

function readType(d: Uint8Array, off: number): string {
  return String.fromCharCode(d[off], d[off + 1], d[off + 2], d[off + 3]);
}

// Дочерние боксы внутри [start, end). Обрезанный заголовок — стоп,
// дальше гадать не по чему.
function children(d: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let off = start;
  const lim = Math.min(end, d.length);
  while (off + 8 <= lim) {
    let size = readU32(d, off);
    const type = readType(d, off + 4);
    let head = 8;
    if (size === 1) {
      if (off + 16 > lim) break;
      const hi = readU32(d, off + 8);
      const lo = readU32(d, off + 12);
      if (hi > 0x1fffff) break; // больше разумного — не бокс
      size = hi * 0x100000000 + lo;
      head = 16;
    } else if (size === 0) {
      size = lim - off;
    }
    if (size < head) break;
    const boxEnd = off + size;
    out.push({ type, start: off + head, end: Math.min(boxEnd, d.length), truncated: boxEnd > d.length });
    if (boxEnd > d.length) break;
    off = boxEnd;
  }
  return out;
}

function first(boxes: Box[], type: string): Box | null {
  for (const b of boxes) if (b.type === type) return b;
  return null;
}

// mdhd: v0 — version(1)+flags(3)+creation(4)+modification(4), timescale на +12;
// v1 — creation/modification по 8 байт, timescale на +20.
// (tb_1790819984_60841_2: было +8 — читали creation_time вместо timescale,
// на живых файлах всегда null.)
function mdhdTimescale(d: Uint8Array, b: Box): number | null {
  if (b.truncated || b.start + 24 > d.length) return null;
  const version = d[b.start];
  const off = b.start + (version === 1 ? 20 : 12);
  if (off + 4 > d.length || off + 4 > b.end) return null;
  const ts = readU32(d, off);
  return ts > 0 ? ts : null;
}

// hdlr handler_type живёт со сдвигом 8 от начала содержимого.
function hdlrType(d: Uint8Array, b: Box): string | null {
  if (b.truncated || b.start + 12 > d.length || b.start + 12 > b.end) return null;
  return readType(d, b.start + 8);
}

interface SttsEntry {
  count: number;
  delta: number;
}

// stts: version/flags, entry_count, пары (sample_count, sample_delta).
function sttsEntries(d: Uint8Array, b: Box): SttsEntry[] | null {
  if (b.truncated || b.start + 8 > d.length) return null;
  const n = readU32(d, b.start + 4);
  if (n <= 0 || n > 1000000) return null;
  const entries: SttsEntry[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const off = b.start + 8 + i * 8;
    if (off + 8 > d.length || off + 8 > b.end) return null;
    const count = readU32(d, off);
    const delta = readU32(d, off + 4);
    if (count <= 0 || delta <= 0) return null;
    entries.push({ count, delta });
    total += count;
    if (total > 100000000) return null;
  }
  return entries;
}

interface TrakData {
  video: boolean;
  timescale: number;
  entries: SttsEntry[];
}

function trakData(d: Uint8Array, trak: Box): TrakData | null {
  if (trak.truncated) return null;
  const kids = children(d, trak.start, trak.end);
  const mdia = first(kids, "mdia");
  if (!mdia || mdia.truncated) return null;
  const mdiaKids = children(d, mdia.start, mdia.end);
  const mdhd = first(mdiaKids, "mdhd");
  const hdlr = first(mdiaKids, "hdlr");
  const minf = first(mdiaKids, "minf");
  if (!mdhd || !minf || minf.truncated) return null;
  const timescale = mdhdTimescale(d, mdhd);
  if (timescale === null) return null;
  const minfKids = children(d, minf.start, minf.end);
  const stbl = first(minfKids, "stbl");
  if (!stbl || stbl.truncated) return null;
  const stts = first(children(d, stbl.start, stbl.end), "stts");
  if (!stts) return null;
  const entries = sttsEntries(d, stts);
  if (!entries) return null;
  return { video: hdlr ? hdlrType(d, hdlr) === "vide" : false, timescale, entries };
}

const MAX_SANE_FPS = 240;

export function parseMp4Fps(d: Uint8Array, opts?: { allowNoFtyp?: boolean }): ContainerFps | null {
  if (!d || d.length < 8) return null;
  // Сигнатура ISO BMFF: ftyp первым топ-боксом. Без неё — не наш формат,
  // честно null (mkv/avi падают на прежнюю цепочку). Хвостовой срез
  // начинается с середины файла — там ftyp не требуем, ищем moov.
  if (!opts?.allowNoFtyp && readType(d, 4) !== "ftyp") return null;
  const top = children(d, 0, d.length);
  const moov = first(top, "moov");
  if (!moov || moov.truncated) return null;
  const traks = children(d, moov.start, moov.end).filter((b) => b.type === "trak");
  const parsed: TrakData[] = [];
  for (const t of traks) {
    const td = trakData(d, t);
    if (td) parsed.push(td);
  }
  if (!parsed.length) return null;
  const chosen = parsed.find((t) => t.video) ?? parsed[0];
  let total = 0;
  let weighted = 0;
  const deltas = new Set<number>();
  for (const e of chosen.entries) {
    total += e.count;
    weighted += e.count * e.delta;
    deltas.add(e.delta);
  }
  if (total <= 0 || weighted <= 0) return null;
  const fps = (chosen.timescale * total) / weighted;
  if (!Number.isFinite(fps) || fps < 1 || fps > MAX_SANE_FPS) return null;
  return { fps, variable: deltas.size > 1 };
}

export type MoovStatus = "complete" | "partial" | "absent";

// Где moov относительно буфера: целиком / обрезан / не виден.
// partial и absent — повод попробовать хвост файла (moov в конце).
export function moovStatus(data: Uint8Array): MoovStatus {
  if (!data || data.length < 8) return "absent";
  const top = children(data, 0, data.length);
  const moov = first(top, "moov");
  if (!moov) return "absent";
  return moov.truncated ? "partial" : "complete";
}

export interface RangeBytes {
  bytes: Uint8Array;
  // Total из Content-Range (null — сервер размер не сказал).
  total: number | null;
  // 206 — сервер режет по Range, 200 — отдал всё (blob:, без Range).
  partial: boolean;
}

export type RangeFetch = (url: string, start: number, end: number) => Promise<RangeBytes | null>;

const HEAD_BYTES = 2 * 1024 * 1024;
const TAIL_BYTES = 8 * 1024 * 1024;

function parseTotal(contentRange: string | null): number | null {
  if (!contentRange) return null;
  const m = /\/(\d+)\s*$/.exec(contentRange);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const defaultRangeFetch: RangeFetch = async (url, start, end) => {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  } catch {
    return null;
  }
  if (!res.ok && res.status !== 206) return null;
  try {
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      bytes: buf,
      total: parseTotal(res.headers.get("Content-Range")) ?? (res.status === 200 ? buf.length : null),
      partial: res.status === 206,
    };
  } catch {
    return null;
  }
};

// Голова → (moov не влез / не виден → хвост) → парсинг. Всё мимо — null,
// цепочка fps падает на прежние звенья. Не бросает исключений.
export async function loadContainerFps(url: string, rangeFetch: RangeFetch = defaultRangeFetch): Promise<ContainerFps | null> {
  if (!url) return null;
  try {
    const head = await rangeFetch(url, 0, HEAD_BYTES - 1);
    if (!head || head.bytes.length < 8) return null;
    // Сервер Range не понял и отдал файл целиком (или файл меньше головы).
    if (!head.partial && (head.total === null || head.total <= HEAD_BYTES)) {
      return parseMp4Fps(head.bytes);
    }
    if (moovStatus(head.bytes) === "complete") return parseMp4Fps(head.bytes);
    const total = head.total;
    if (total === null || total <= head.bytes.length) return parseMp4Fps(head.bytes);
    const tail = await rangeFetch(url, Math.max(0, total - TAIL_BYTES), total - 1);
    if (!tail || tail.bytes.length < 8) return null;
    return parseMp4Fps(tail.bytes, { allowNoFtyp: true });
  } catch {
    return null;
  }
}
