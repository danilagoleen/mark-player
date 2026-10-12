// tb_1791521998_11250_5: плейлист-вопрос vetka.cut.question_playlist/1.
// Агент отдаёт одним файлом «вот N мест для проверки»: запись = ссылка на
// файл + вопрос + гипотеза + скобки in/out + маркеры-подсказки. Пользователь
// отвечает маркерами (favorite = угадал, negative = нет, comment = спорно),
// ответы дописываются в <playlist>.answers.json рядом с плейлистом — агент
// читает их без плеера. Все поля необязательные: старый плейлист без них
// открывается как раньше. Время — СЕКУНДЫ от начала файла, не таймкод.

import type { Playlist, PlaylistEntry } from "./playlist";

export const QUESTION_PLAYLIST_SCHEMA = "vetka.cut.question_playlist/1";

/** ref — то, по чему агент запишет ответ обратно в базу (confirmed/rejected + confirmed_by). */
export interface QuestionRef {
  layer: string;
  id: string;
}

export type QuestionMarkerKind = "favorite" | "negative" | "in" | "out" | "comment" | "chat";

export interface QuestionMarker {
  kind: QuestionMarkerKind;
  /** секунды от начала файла */
  t_sec: number;
  text?: string;
}

const QUESTION_MARKER_KINDS: QuestionMarkerKind[] = [
  "favorite",
  "negative",
  "in",
  "out",
  "comment",
  "chat",
];

/** Необязательные поля записи-вопроса (живут прямо в PlaylistEntry). */
export interface QuestionEntryFields {
  /** локальный ключ плейлиста (не путать с ref — ключом базы) */
  question_id?: string;
  question?: string;
  hypothesis?: string;
  /** секунды от начала файла */
  in_sec?: number;
  /** секунды от начала файла */
  out_sec?: number;
  markers?: QuestionMarker[];
  ref?: QuestionRef;
  /** варианты ответа (калибровка камеры); ответ несёт choice */
  choices?: string[];
  // tb_1791754893_1275_4: регион-лицо в долях кадра (x,y — левый верхний
  // угол, w,h — размер; всё 0..1, x+w<=1, y+h<=1). Плеер рисует рамку,
  // пока активен вопрос; Premiere видит регион текстом (§5.1 манифеста).
  bbox?: QuestionBox;
  /** рамка на out_sec: плеер линейно едет bbox→bbox_end за in..out. */
  bbox_end?: QuestionBox;
}

/** Рамка региона в долях кадра. */
export interface QuestionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type QuestionEntry = PlaylistEntry & QuestionEntryFields;

export interface QuestionPlaylistSource {
  /** кто спросил: agent | Beta | … */
  by?: string;
  task?: string;
  /** о чём: camera | people | reel */
  layer?: string;
}

export type QuestionPlaylist = Playlist & {
  schema?: string;
  source?: QuestionPlaylistSource;
};

export type AnswerVerdict = "favorite" | "negative" | "comment";

export interface AnswerRecord {
  question_id: string;
  verdict: AnswerVerdict;
  comment?: string;
  /** позиция ответа, секунды от начала файла */
  t_sec?: number;
  /** скобки, если пользователь их сдвинул */
  in_sec?: number;
  /** скобки, если пользователь их сдвинул */
  out_sec?: number;
  choice?: string;
  /** кто ответил, по умолчанию "operator" */
  confirmed_by?: string;
  answered_at: string;
}

export const DEFAULT_CONFIRMED_BY = "operator";

/** Путь файла плейлиста-вопроса — помнит та сторона, что открыла его из файла. */
export const QUESTION_PLAYLIST_PATH_KEY = "vetka_player_lab_question_playlist_path_v1";
/** Web/outbox ответов (нет Tauri fs): агент в десктопе читает файл, не это. */
export const QUESTION_ANSWERS_OUTBOX_KEY = "vetka_player_lab_question_answers_outbox_v1";

function finiteOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function textOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function stringArrayOrUndefined(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

// tb_1791754893_1275_4: рамка в долях кадра. Мусор (не числа, вне 0..1,
// нулевой размер, вылезание за кадр) — отбрасывается целиком: лучше без
// рамки, чем рамка мимо лица.
function fractionOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

export function normalizeQuestionBox(raw: unknown): QuestionBox | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const m = raw as Record<string, unknown>;
  const x = fractionOrUndefined(m.x);
  const y = fractionOrUndefined(m.y);
  const w = fractionOrUndefined(m.w);
  const h = fractionOrUndefined(m.h);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  if (w <= 0 || h <= 0) return undefined;
  if (x + w > 1 || y + h > 1) return undefined;
  return { x, y, w, h };
}

/** Линейная езда рамки a→b за долю k (0..1, кламп) — «трекинг для бедных». */
export function lerpQuestionBox(a: QuestionBox, b: QuestionBox, k: number): QuestionBox {
  const t = Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0;
  const mix = (p: number, q: number) => p + (q - p) * t;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h) };
}

// tb_1791754893_1275_4: текст reply-маркера, который карточка пишет в
// Comments (§6.2: choice + comment + verdict). Читается и человеком, и
// парсится глазами агента: `[answer] same: сошлось (favorite)`.
export function formatAnswerReplyText(input: { verdict: AnswerVerdict; choice?: string; comment?: string }): string {
  const parts: string[] = [];
  const choice = typeof input.choice === "string" ? input.choice.trim() : "";
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (choice) parts.push(choice);
  if (comment) parts.push(comment);
  const head = parts.length > 0 ? parts.join(": ") : "";
  return head ? `[answer] ${head} (${input.verdict})` : `[answer] (${input.verdict})`;
}

/** Мягкая нормализация одной записи: чужое отбрасывается, своё чистится. */
export function normalizeQuestionEntry(raw: unknown): QuestionEntryFields {
  if (!raw || typeof raw !== "object") return {};
  const m = raw as Record<string, unknown>;
  const out: QuestionEntryFields = {};
  const question_id = textOrUndefined(m.question_id);
  if (question_id !== undefined) out.question_id = question_id;
  const question = textOrUndefined(m.question);
  if (question !== undefined) out.question = question;
  const hypothesis = textOrUndefined(m.hypothesis);
  if (hypothesis !== undefined) out.hypothesis = hypothesis;
  const in_sec = finiteOrUndefined(m.in_sec);
  if (in_sec !== undefined && in_sec >= 0) out.in_sec = in_sec;
  const out_sec = finiteOrUndefined(m.out_sec);
  if (out_sec !== undefined && out_sec >= 0) out.out_sec = out_sec;
  if (Array.isArray(m.markers)) {
    const markers: QuestionMarker[] = [];
    for (const rawMarker of m.markers) {
      if (!rawMarker || typeof rawMarker !== "object") continue;
      const rm = rawMarker as Record<string, unknown>;
      const kind = QUESTION_MARKER_KINDS.includes(rm.kind as QuestionMarkerKind)
        ? (rm.kind as QuestionMarkerKind)
        : "comment";
      const t_sec = finiteOrUndefined(rm.t_sec);
      if (t_sec === undefined || t_sec < 0) continue;
      const marker: QuestionMarker = { kind, t_sec };
      const text = textOrUndefined(rm.text);
      if (text !== undefined) marker.text = text;
      markers.push(marker);
    }
    if (markers.length > 0) out.markers = markers;
  }
  const rawRef = m.ref;
  if (rawRef && typeof rawRef === "object") {
    const rr = rawRef as Record<string, unknown>;
    const layer = textOrUndefined(rr.layer);
    const id = textOrUndefined(rr.id);
    if (layer !== undefined && id !== undefined) out.ref = { layer, id };
  }
  const choices = stringArrayOrUndefined(m.choices);
  if (choices !== undefined) out.choices = choices;
  // tb_1791764026_23730_1: tolerant-read — канон на записи, но Бета
  // фактически несёт bbox в markers[0] (people_merges_v01): нет своего —
  // берём из первого сырого маркера, где есть. Сырые, не чищенные:
  // normalizeQuestionBox валидирует заново.
  const rawMarkers = Array.isArray(m.markers) ? m.markers : [];
  const firstMarkerBox = (key: string): QuestionBox | undefined => {
    for (const rm of rawMarkers) {
      if (!rm || typeof rm !== "object") continue;
      const b = normalizeQuestionBox((rm as Record<string, unknown>)[key]);
      if (b !== undefined) return b;
    }
    return undefined;
  };
  const bbox = normalizeQuestionBox(m.bbox) ?? firstMarkerBox("bbox");
  if (bbox !== undefined) out.bbox = bbox;
  const bboxEnd = normalizeQuestionBox(m.bbox_end) ?? firstMarkerBox("bbox_end");
  if (bboxEnd !== undefined) out.bbox_end = bboxEnd;
  return out;
}

export function isQuestionPlaylist(playlist: Playlist | null | undefined): playlist is QuestionPlaylist {
  if (!playlist || typeof playlist !== "object") return false;
  const p = playlist as QuestionPlaylist;
  if (p.schema !== undefined && p.schema !== QUESTION_PLAYLIST_SCHEMA) return false;
  return Array.isArray(p.entries) && p.entries.some((e) => (e as QuestionEntry).question_id !== undefined);
}

/** Найти запись-вопрос: сначала по question_id, иначе по path. */
export function findQuestionEntry(
  playlist: Playlist | null | undefined,
  opts: { questionId?: string | null; path?: string | null },
): QuestionEntry | null {
  if (!playlist || !Array.isArray(playlist.entries)) return null;
  const entries = playlist.entries as QuestionEntry[];
  if (opts.questionId) {
    const hit = entries.find((e) => e.question_id === opts.questionId);
    if (hit) return hit;
  }
  if (opts.path) {
    const hit = entries.find((e) => e.path === opts.path && e.question_id !== undefined);
    if (hit) return hit;
  }
  return null;
}

/** Имя файла ответов рядом с плейлистом: <playlist>.answers.json */
export function answersPathFor(playlistPath: string): string {
  return `${playlistPath}.answers.json`;
}

/** Только дописывание: новый ответ в конец, старое не трогаем. */
export function appendAnswerRecord(existing: AnswerRecord[], next: AnswerRecord): AnswerRecord[] {
  return [...existing, next];
}

export function parseAnswersFile(text: string | null | undefined): AnswerRecord[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed as { answers?: unknown }).answers;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (a): a is AnswerRecord =>
        !!a && typeof a === "object" && typeof (a as AnswerRecord).question_id === "string",
    );
  } catch {
    return [];
  }
}

export function serializeAnswersFile(records: AnswerRecord[]): string {
  return JSON.stringify({ answers: records }, null, 2);
}

/**
 * Действующие ответы: несколько ответов на один question_id допустимы,
 * действует последний по answered_at. Плеер ответы не стирает.
 */
export function resolveAnswers(records: AnswerRecord[]): Map<string, AnswerRecord> {
  const out = new Map<string, AnswerRecord>();
  for (const r of records) {
    const prev = out.get(r.question_id);
    if (!prev || String(r.answered_at) >= String(prev.answered_at)) out.set(r.question_id, r);
  }
  return out;
}

export function readQuestionPlaylistPath(): string | null {
  try {
    const raw = localStorage.getItem(QUESTION_PLAYLIST_PATH_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function rememberQuestionPlaylistPath(path: string | null): void {
  try {
    if (path) localStorage.setItem(QUESTION_PLAYLIST_PATH_KEY, path);
    else localStorage.removeItem(QUESTION_PLAYLIST_PATH_KEY);
  } catch {
    // ignore — путь просто не запомнится
  }
}

export function readAnswersOutbox(): AnswerRecord[] {
  try {
    return parseAnswersFile(localStorage.getItem(QUESTION_ANSWERS_OUTBOX_KEY));
  } catch {
    return [];
  }
}

export function appendAnswersOutbox(next: AnswerRecord): void {
  try {
    // outbox — сырой массив (parseAnswersFile понимает и его, и {answers})
    const raw = localStorage.getItem(QUESTION_ANSWERS_OUTBOX_KEY);
    let list: AnswerRecord[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) list = parsed.filter((a): a is AnswerRecord => !!a && typeof a === "object");
      } catch {
        // ignore
      }
    }
    localStorage.setItem(QUESTION_ANSWERS_OUTBOX_KEY, JSON.stringify([...list, next]));
  } catch {
    // ignore — ответ потерян только в web без LS
  }
}
