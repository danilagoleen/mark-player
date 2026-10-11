// subtitles.ts — дорожка субтитров SRT: парсинг, поиск реплики, хранение.
// tb_1791156671_82609_1 (P2, ядро для Mark и CUT Player). Доктрина §8.1:
// SRT = дорожка для человека, маркеров НЕ создаёт (только хинт с кнопкой).

export interface SubtitleCue {
  start: number;
  end: number;
  /** Текст реплики, переносы строк из SRT сохранены (\n). */
  text: string;
}

export interface SubtitleTrack {
  cues: SubtitleCue[];
  sourceName: string;
  importedAt: string;
}

export type SubtitleStore = Record<string, SubtitleTrack>;

export const SUBTITLES_STORAGE_KEY = "vetka_player_lab_subtitles_v1";

/**
 * Ключ дорожки: абсолютный путь файла, иначе identity текущего медиа.
 * Переключение элемента плейлиста меняет ключ → показывается его дорожка.
 */
export function resolveSubtitleTrackKey(
  currentFilePath: string | null | undefined,
  currentMediaKey: string | null | undefined,
): string | null {
  return currentFilePath || currentMediaKey || null;
}

/** Одиночные глифы видов маркеров — по ним опознаём SRT из Mark Player (§6 спеки). */
const MARKER_GLYPHS = ["★", "·", "⇒", "←", "✗"];

function parseSrtTimestamp(raw: string): number | null {
  const m = raw.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return null;
  const ms = m[4].padEnd(3, "0");
  const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(ms) / 1000;
  return Number.isFinite(sec) ? sec : null;
}

export interface ParsedSubtitles {
  cues: SubtitleCue[];
  /** Ошибки разбора с номерами строк (блоки с битым таймингом пропускаются). */
  errors: string[];
}

/**
 * Парсер SRT: BOM, CRLF/LF, мс через запятую/точку, блоки без номера —
 * не ошибка. Пересекающиеся реплики сохраняются как есть (показ — обе).
 */
export function parseSubtitleSrt(input: string): ParsedSubtitles {
  const cues: SubtitleCue[] = [];
  const errors: string[] = [];
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return { cues, errors };
  const blocks = text.trim().split(/\n{2,}/);
  let lineNo = 0;
  for (const block of blocks) {
    const blockStartLine = lineNo + 1;
    const rawLines = block.split("\n");
    lineNo += rawLines.length + 1; // +1 за пустую строку-разделитель
    const lines = rawLines.map((l) => l.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) continue;
    // Опциональный номер: первая строка из одних цифр — съедаем.
    const body = /^\d+$/.test(nonEmpty[0]) ? nonEmpty.slice(1) : nonEmpty;
    if (body.length < 2) {
      errors.push(`line ${blockStartLine}: block without timing`);
      continue;
    }
    const arrow = body[0].indexOf("-->");
    if (arrow === -1) {
      errors.push(`line ${blockStartLine}: bad timestamp line`);
      continue;
    }
    const start = parseSrtTimestamp(body[0].slice(0, arrow));
    const end = parseSrtTimestamp(body[0].slice(arrow + 3));
    if (start === null || end === null || end < start) {
      errors.push(`line ${blockStartLine}: bad timestamp line`);
      continue;
    }
    const cueText = body.slice(1).join("\n").trim();
    if (!cueText) {
      errors.push(`line ${blockStartLine}: empty cue text`);
      continue;
    }
    cues.push({ start, end, text: cueText });
  }
  cues.sort((a, b) => a.start - b.start);
  return { cues, errors };
}

/**
 * Реплики на момент t: start включительно, end исключительно.
 * Пересекающиеся — все (показываем обе). Бинарный поиск + развёртка соседей.
 */
export function findCuesAt(cues: SubtitleCue[], t: number): SubtitleCue[] {
  if (!cues.length || !Number.isFinite(t)) return [];
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  const out: SubtitleCue[] = [];
  // Назад от точки вставки: ранняя длинная реплика может перекрывать t,
  // поэтому проход полный (реплик сотни — дёшево даже покадрово).
  for (let i = lo - 1; i >= 0; i--) {
    if (cues[i].start <= t && t < cues[i].end) out.push(cues[i]);
  }
  // Блок выше идёт назад и может упереться в длинную раннюю реплику —
  // добираем вперёд от точки вставки (дешёво: пересечения локальны).
  for (let i = lo; i < cues.length && cues[i].start <= t; i++) {
    if (t < cues[i].end) out.push(cues[i]);
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** ≥50% реплик начинаются с глифа вида маркера → это SRT из Mark Player. */
export function looksLikeMarkers(cues: SubtitleCue[]): boolean {
  if (!cues.length) return false;
  let hits = 0;
  for (const c of cues) {
    const first = c.text.trimStart().charAt(0);
    if (MARKER_GLYPHS.includes(first)) hits++;
  }
  return hits * 2 >= cues.length;
}

/** Байты → текст: строгий UTF-8, иначе фолбэк cp1251 (§1 спеки). */
export function decodeSubtitleBytes(buf: ArrayBuffer): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1251").decode(buf), encoding: "cp1251" };
  }
}

// ── Хранение: тот же LS-стор, что маркеры (ADR №3), свой ключ. ──

export function loadSubtitleStore(): SubtitleStore {
  try {
    const raw = localStorage.getItem(SUBTITLES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const store: SubtitleStore = {};
    for (const [k, v] of Object.entries(parsed)) {
      const track = v as Partial<SubtitleTrack>;
      if (track && Array.isArray(track.cues)) {
        store[k] = {
          cues: track.cues.filter(
            (c) => c && typeof c.start === "number" && typeof c.end === "number" && typeof c.text === "string",
          ),
          sourceName: typeof track.sourceName === "string" ? track.sourceName : "",
          importedAt: typeof track.importedAt === "string" ? track.importedAt : "",
        };
      }
    }
    return store;
  } catch {
    return {};
  }
}

function persistSubtitleStore(store: SubtitleStore): void {
  try {
    localStorage.setItem(SUBTITLES_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // панель живёт в памяти, если стора нет
  }
}

export function saveSubtitleTrack(mediaPath: string, cues: SubtitleCue[], sourceName: string): SubtitleStore {
  const store = loadSubtitleStore();
  const next = { ...store, [mediaPath]: { cues, sourceName, importedAt: new Date().toISOString() } };
  persistSubtitleStore(next);
  return next;
}

export function removeSubtitleTrack(mediaPath: string): SubtitleStore {
  const store = loadSubtitleStore();
  if (!(mediaPath in store)) return store;
  const next = { ...store };
  delete next[mediaPath];
  persistSubtitleStore(next);
  return next;
}
