import { KIND_GLYPH, KIND_PPRO_COLOR } from "../srtUtils";

// Обратный путь к exportMarkersToXmeml / exportPlaylistToXmeml: XMEML v4
// (наш экспорт, Premiere, DaVinci) → маркеры плеера, сгруппированные по файлу.
// Чистый разбор без UI и без привязки к открытому видео.

export type ImportedMarkerKind = "favorite" | "negative" | "comment" | "in" | "out";

export interface ImportedMarker {
  kind: ImportedMarkerKind;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  // Пустой label = «имени не было» (приложение подставит дефолт вида).
  label: string;
  text: string;
}

export interface XmemlFileGroup {
  fileId: string;
  name: string;
  path: string;
  fps: number;
  durationSec: number | null;
  markers: ImportedMarker[];
}

export interface XmemlImportResult {
  ok: boolean;
  error?: string;
  groups: XmemlFileGroup[];
  // Маркеры секвенса живут во времени таймлайна, а не исходника: к файлу их
  // не привязать, поэтому честно считаем и сообщаем, а не гадаем.
  skippedSequenceMarkers: number;
}

interface FileInfo {
  name: string;
  path: string;
  timebase: number | null;
  ntsc: boolean;
  duration: number | null;
}

const GLYPH_TO_KIND: Record<string, ImportedMarkerKind> = {
  [KIND_GLYPH.favorite]: "favorite",
  [KIND_GLYPH.negative]: "negative",
  [KIND_GLYPH.comment]: "comment",
  [KIND_GLYPH.inout]: "comment",
};

// Имя без label экспорт пишет словом-видом: «★ FAVORITE», «✗ NEGATIVE»,
// «· NOTE», «comment». Это не подпись человека — label остаётся пустым.
const KIND_WORDS = new Set(["favorite", "negative", "note", "comment", "chat", "inout", "in-out"]);

const DEFAULT_FPS = 25;

// Экспорт без label клеит слово-префикс и вид без пробела: «✗ NEGATIVEnegative».
// Это то же «имени не было» — узнаём и слово, и удвоенное слово.
function isKindWord(body: string): boolean {
  const lower = body.toLowerCase();
  if (KIND_WORDS.has(lower)) return true;
  for (const w of KIND_WORDS) if (lower === w + w) return true;
  return false;
}

function child(el: Element, tag: string): Element | null {
  for (const c of Array.from(el.children)) if (c.tagName === tag) return c;
  return null;
}

function childText(el: Element, tag: string): string {
  return child(el, tag)?.textContent?.trim() ?? "";
}

function childInt(el: Element, tag: string): number | null {
  const raw = childText(el, tag);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readRate(el: Element | null): { timebase: number; ntsc: boolean } | null {
  if (!el) return null;
  const rate = child(el, "rate");
  if (!rate) return null;
  const tb = childInt(rate, "timebase");
  if (!tb || tb <= 0) return null;
  return { timebase: tb, ntsc: childText(rate, "ntsc").toUpperCase() === "TRUE" };
}

// NTSC-таймбейс 30 значит 30000/1001 кадров в секунду, а не 30.
function rateToFps(rate: { timebase: number; ntsc: boolean } | null): number {
  if (!rate) return DEFAULT_FPS;
  return rate.ntsc ? (rate.timebase * 1000) / 1001 : rate.timebase;
}

export function pathFromPathUrl(pathurl: string): string {
  const raw = pathurl.trim();
  if (!raw) return "";
  let rest = raw.replace(/^file:\/\/(localhost)?/i, "");
  // Windows: file://localhost/C:/dir/a.mov → C:/dir/a.mov
  if (/^\/[A-Za-z]:\//.test(rest)) rest = rest.slice(1);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// ABGR: 0xFF | B<<16 | G<<8 | R (проверено в живом Premiere, см. KIND_PPRO_COLOR).
export function kindFromPproColor(color: number | null): ImportedMarkerKind {
  if (color === null || !Number.isFinite(color)) return "comment";
  for (const kind of ["negative", "favorite", "comment"] as const) {
    if (KIND_PPRO_COLOR[kind] === color) return kind;
  }
  const r = color & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = (color >>> 16) & 0xff;
  const max = Math.max(r, g, b);
  const margin = 100;
  if (r === max && r - Math.max(g, b) > margin) return "negative";
  if (g === max && g - Math.max(r, b) > margin) return "favorite";
  return "comment";
}

export function decodeMarkerName(
  name: string,
  color: number | null,
): { kind: ImportedMarkerKind; label: string } {
  const trimmed = name.trim();
  const first = Array.from(trimmed)[0] ?? "";
  const glyphKind = GLYPH_TO_KIND[first];
  let body = trimmed;
  let kind: ImportedMarkerKind;
  if (glyphKind) {
    kind = glyphKind;
    body = trimmed.slice(first.length).trim();
  } else {
    kind = kindFromPproColor(color);
  }
  if (isKindWord(body)) body = "";
  return { kind, label: body };
}

function collectFiles(doc: Document): Map<string, FileInfo> {
  const files = new Map<string, FileInfo>();
  for (const f of Array.from(doc.getElementsByTagName("file"))) {
    const id = f.getAttribute("id");
    if (!id) continue;
    const pathurl = childText(f, "pathurl");
    const name = childText(f, "name");
    // Ссылка <file id="x"/> без тела не затирает полное определение.
    if (!pathurl && !name && files.has(id)) continue;
    const rate = readRate(f);
    files.set(id, {
      name: name || baseName(pathFromPathUrl(pathurl)),
      path: pathFromPathUrl(pathurl),
      timebase: rate ? rate.timebase : null,
      ntsc: rate ? rate.ntsc : false,
      duration: childInt(f, "duration"),
    });
  }
  return files;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function parseXmemlMarkers(xml: string): XmemlImportResult {
  const empty = (error: string): XmemlImportResult => ({ ok: false, error, groups: [], skippedSequenceMarkers: 0 });
  if (!xml || !xml.trim()) return empty("The file is empty.");
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return empty("The file is not valid XML.");
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return empty("The file is not valid XML.");
  if (doc.documentElement?.tagName !== "xmeml") return empty("Not an XMEML file (Premiere / DaVinci timeline XML).");

  const sequenceRate = readRate(doc.getElementsByTagName("sequence")[0] ?? null);
  const files = collectFiles(doc);
  const groups = new Map<string, XmemlFileGroup>();
  const seen = new Set<string>();

  const groupFor = (fileId: string, fps: number): XmemlFileGroup => {
    let g = groups.get(fileId);
    if (!g) {
      const info = files.get(fileId);
      g = {
        fileId,
        name: info?.name ?? fileId,
        path: info?.path ?? "",
        fps,
        durationSec: info?.duration != null ? round3(info.duration / fps) : null,
        markers: [],
      };
      groups.set(fileId, g);
    }
    return g;
  };

  const pushMarker = (g: XmemlFileGroup, m: ImportedMarker): void => {
    // Экспорт повторяет маркеры источника в каждом клипе нарезки — склеиваем.
    const key = `${g.fileId}|${m.kind}|${m.start_sec}|${m.end_sec}|${m.label}|${m.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    g.markers.push(m);
  };

  const clipEls = [
    ...Array.from(doc.getElementsByTagName("clipitem")),
    ...Array.from(doc.getElementsByTagName("clip")),
  ];
  for (const clip of clipEls) {
    const fileEl = child(clip, "file");
    const fileId = fileEl?.getAttribute("id");
    if (!fileEl || !fileId) continue;
    const info = files.get(fileId);
    const rate =
      readRate(clip) ??
      (info?.timebase ? { timebase: info.timebase, ntsc: info.ntsc } : null) ??
      sequenceRate;
    const fps = rateToFps(rate);
    const toSec = (frame: number) => round3(frame / fps);
    const g = groupFor(fileId, fps);

    for (const mk of Array.from(clip.children).filter((c) => c.tagName === "marker")) {
      const inF = childInt(mk, "in");
      if (inF === null || inF < 0) continue;
      const outF = childInt(mk, "out");
      const color = childInt(mk, "pproColor");
      const { kind, label } = decodeMarkerName(childText(mk, "name"), color);
      const start = toSec(inF);
      const isRange = outF !== null && outF > inF;
      const end = isRange ? toSec(outF) : start;
      pushMarker(g, {
        kind,
        start_sec: start,
        end_sec: end,
        anchor_sec: round3((start + end) / 2),
        label,
        text: childText(mk, "comment"),
      });
    }

    // Нарезка видеодорожки — это наши in/out: экспорт превращает пары в клипы.
    // Полный клип (без нарезки) и аудио-дубли маркеров не порождают.
    if (clip.tagName === "clipitem" && clip.closest("video")) {
      const inF = childInt(clip, "in");
      const outF = childInt(clip, "out");
      const duration = childInt(clip, "duration") ?? info?.duration ?? null;
      if (inF !== null && outF !== null && outF > inF && !(inF === 0 && duration !== null && outF >= duration)) {
        const pushPoint = (kind: "in" | "out", frame: number) => {
          const t = toSec(frame);
          pushMarker(g, { kind, start_sec: t, end_sec: t, anchor_sec: t, label: "", text: "" });
        };
        pushPoint("in", inF);
        // Одинокий in экспортируется клипом до конца файла — out там не ставили.
        if (duration === null || outF < duration) pushPoint("out", outF);
      }
    }
  }

  let skipped = 0;
  for (const seq of Array.from(doc.getElementsByTagName("sequence"))) {
    skipped += Array.from(seq.children).filter((c) => c.tagName === "marker").length;
  }

  const result = Array.from(groups.values())
    .map((g) => ({ ...g, markers: g.markers.sort((a, b) => a.start_sec - b.start_sec) }))
    .filter((g) => g.markers.length > 0);
  return { ok: true, groups: result, skippedSequenceMarkers: skipped };
}

// Группа → известный путь: точное совпадение пути, иначе единственное
// совпадение по имени файла. Неоднозначность = null (не гадаем).
export function matchGroupToPath(group: { name: string; path: string }, candidates: string[]): string | null {
  if (group.path && candidates.includes(group.path)) return group.path;
  const wanted = (group.path ? baseName(group.path) : group.name).toLowerCase();
  if (!wanted) return null;
  const hits = Array.from(new Set(candidates.filter((c) => baseName(c).toLowerCase() === wanted)));
  return hits.length === 1 ? hits[0] : null;
}

// Маркер уже есть у медиа: тот же вид, то же место (полкадра), тот же текст.
export function isSameImportedMarker(
  existing: { kind: string; start_sec: number; label: string; text: string },
  incoming: ImportedMarker,
  fps: number,
): boolean {
  const tolerance = 0.5 / Math.max(1, fps);
  return (
    existing.kind === incoming.kind &&
    Math.abs(existing.start_sec - incoming.start_sec) <= tolerance + 1e-6 &&
    (existing.text || "") === incoming.text &&
    (incoming.label === "" || (existing.label || "") === incoming.label)
  );
}
