// tb_1791333803_37784_1: превью монтажного листа одного видео (1.0 п.4.5).
// Только чтение листа ADR-06 (vetka.cut.sheet/1): строки одного media.path
// → сегменты в секундах для скип-движка In–Out Play. Без округления:
// нецелые тики и тики > 2^53 — явная ошибка (ADR-06 §3.5).

export const TICKS_PER_SECOND = 254016000000;
export const CUTSHEET_SCHEMA = "vetka.cut.sheet/1";
const MAX_SAFE_TICKS = 2 ** 53;

export interface CutsheetRow {
  id: string;
  media: string;
  srcInTicks: number;
  srcOutTicks: number;
}

export interface CutsheetDoc {
  title: string;
  mediaPaths: Map<string, string>;
  rows: CutsheetRow[];
}

export interface CutsheetSegment {
  start: number;
  end: number;
}

export type ParseResult =
  | { ok: true; doc: CutsheetDoc }
  | { ok: false; error: string };

export type ResolveResult =
  | { ok: true; segments: CutsheetSegment[]; sheetPath: string; title: string }
  | { ok: false; error: "multi-media" | "foreign-media" | "bad-ticks" | "bad-row" | "no-rows"; mediaCount?: number; sheetPath?: string; openPath?: string; rowId?: string };

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCutsheet(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "not-json" };
  }
  if (!isRecord(raw)) return { ok: false, error: "not-object" };
  if (raw.schema !== CUTSHEET_SCHEMA) return { ok: false, error: `schema: expected ${CUTSHEET_SCHEMA}` };
  if (!isRecord(raw.media)) return { ok: false, error: "no-media" };
  if (!Array.isArray(raw.rows)) return { ok: false, error: "no-rows" };
  const mediaPaths = new Map<string, string>();
  for (const [key, entry] of Object.entries(raw.media)) {
    if (isRecord(entry) && typeof entry.path === "string" && entry.path.length > 0) {
      mediaPaths.set(key, entry.path);
    }
  }
  if (mediaPaths.size === 0) return { ok: false, error: "no-media" };
  const rows: CutsheetRow[] = [];
  for (const item of raw.rows) {
    if (!isRecord(item)) return { ok: false, error: "bad-row" };
    if (typeof item.id !== "string" || typeof item.media !== "string") {
      return { ok: false, error: "bad-row" };
    }
    if (typeof item.src_in !== "number" || typeof item.src_out !== "number") {
      return { ok: false, error: "bad-ticks" };
    }
    rows.push({ id: item.id, media: item.media, srcInTicks: item.src_in, srcOutTicks: item.src_out });
  }
  if (rows.length === 0) return { ok: false, error: "no-rows" };
  return {
    ok: true,
    doc: {
      title: typeof raw.title === "string" ? raw.title : "cutsheet",
      mediaPaths,
      rows,
    },
  };
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function basename(p: string): string {
  const n = normalizePath(p);
  return n.slice(n.lastIndexOf("/") + 1);
}

function joinDir(dir: string, rel: string): string {
  if (/^[a-zA-Z]:\//.test(rel) || rel.startsWith("/")) return normalizePath(rel);
  return normalizePath(`${dir}/${rel}`);
}

/** Строки одного media → сегменты в секундах. Несколько media — отказ multi-media. */
export function resolveCutsheetForMedia(
  doc: CutsheetDoc,
  sheetDir: string,
  openPath: string,
): ResolveResult {
  const usedKeys = new Set(doc.rows.map((r) => r.media));
  if (usedKeys.size !== 1) {
    return { ok: false, error: "multi-media", mediaCount: usedKeys.size };
  }
  const key = [...usedKeys][0];
  const rel = doc.mediaPaths.get(key);
  if (!rel) return { ok: false, error: "foreign-media", openPath };
  const sheetPath = joinDir(normalizePath(sheetDir), rel);
  const openNorm = normalizePath(openPath);
  // Полное совпадение — или по имени файла (браузер открывает blob, ключ — имя).
  if (sheetPath !== openNorm && basename(sheetPath) !== basename(openNorm)) {
    return { ok: false, error: "foreign-media", sheetPath, openPath };
  }
  const segments: CutsheetSegment[] = [];
  for (const r of doc.rows) {
    if (!Number.isInteger(r.srcInTicks) || !Number.isInteger(r.srcOutTicks)) {
      return { ok: false, error: "bad-ticks", rowId: r.id };
    }
    if (
      r.srcInTicks < 0 || r.srcOutTicks < 0 ||
      r.srcInTicks > MAX_SAFE_TICKS || r.srcOutTicks > MAX_SAFE_TICKS
    ) {
      return { ok: false, error: "bad-ticks", rowId: r.id };
    }
    if (!(r.srcOutTicks > r.srcInTicks)) {
      return { ok: false, error: "bad-row", rowId: r.id };
    }
    segments.push({ start: ticksToSeconds(r.srcInTicks), end: ticksToSeconds(r.srcOutTicks) });
  }
  segments.sort((a, b) => a.start - b.start);
  // Пересекающиеся строки сливаются — движку нужен непересекающийся список.
  const merged: CutsheetSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }
  return { ok: true, segments: merged, sheetPath, title: doc.title };
}
