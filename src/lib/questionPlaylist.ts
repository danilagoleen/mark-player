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
  // tb_1792547382_5133_1: подпись/титр поверх кадра на in..out записи
  // (разведка §2, «Подпись/титр поверх кадра»). Показ — только плеером;
  // в Premiere и в SRT-маркеры НЕ уезжает: полей под текстовую подпись там нет.
  caption?: string;
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

// tb_1791809796_24701_1: обратная разборка текста ответа (канон «одна правда —
// маркеры»): `[answer] choice: comment (verdict)`. Без префикса — null
// (свободный текст трактует answersFromMarkers, не парсер).
const ANSWER_RE = /^\[answer\]\s*([\s\S]*?)\s*\((favorite|negative|comment)\)\s*$/;

export interface ParsedAnswerReply {
  verdict: AnswerVerdict;
  choice?: string;
  comment?: string;
  /** одиночный head `[answer] X (v)`: разобрать позже по вариантам вопроса. */
  single?: string;
}

export function parseAnswerReplyText(text: string | null | undefined): ParsedAnswerReply | null {
  if (typeof text !== "string") return null;
  const m = ANSWER_RE.exec(text.trim());
  if (!m) return null;
  const verdict = m[2] as AnswerVerdict;
  const head = (m[1] ?? "").trim().replace(/\s+/g, " ");
  if (!head) return { verdict };
  const sep = head.indexOf(": ");
  if (sep < 0) return { verdict, single: head };
  const choice = head.slice(0, sep).trim();
  const comment = head.slice(sep + 2).trim();
  const out: ParsedAnswerReply = { verdict };
  if (choice) out.choice = choice;
  if (comment) out.comment = comment;
  return out;
}

/** Минимум маркера, нужный выжимке (оба окна структурно подходят). */
export interface ExtractableMarker {
  marker_id: string;
  text?: string | null;
  author?: string | null;
  anchor_sec?: number | null;
  start_sec?: number | null;
  end_sec?: number | null;
  reply_to?: string | null;
  created_at?: string | null;
  /** поле qmat-маркера; у старых — только id-префикс (см. legacy). */
  question_id?: string | null;
}

export interface AnswersExtractOptions {
  /** Старые qmat-маркеры без поля: id-префикс → question_id (плейлист того же окна). */
  resolveLegacyQuestionId?: (parentId: string) => string | undefined;
  /** Одиночный head `[answer] X (v)`: X — choice, если в списке вариантов вопроса. */
  choicesOf?: (questionId: string) => string[] | undefined;
}

function finiteNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * tb_1791809796_24701_1: answers.json = выжимка из маркеров. Прямые дети qmat —
 * ответы: с префиксом [answer] — разбор вердикта/choice/comment, без — свободный
 * текст (verdict comment, Commander). t_sec = anchor ответа (карточка ставит
 * playhead), answered_at = created_at, скобки = текущий диапазон родителя
 * (человек двигает сам qmat). Несколько ответов на вопрос — все (последний
 * главнее — дело потребителя, см. resolveAnswers). Плеер ответы не стирает.
 */
export function answersFromMarkers(
  markers: ExtractableMarker[],
  opts?: AnswersExtractOptions,
): AnswerRecord[] {
  if (!Array.isArray(markers)) return [];
  const byId = new Map<string, ExtractableMarker>();
  for (const m of markers) {
    if (m && typeof m === "object" && typeof m.marker_id === "string") byId.set(m.marker_id, m);
  }
  const out: AnswerRecord[] = [];
  for (const m of markers) {
    if (!m || typeof m !== "object") continue;
    const parentId = typeof m.reply_to === "string" ? m.reply_to : "";
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) continue;
    const fieldQid = typeof parent.question_id === "string" ? parent.question_id.trim() : "";
    const legacyQid = !fieldQid && typeof parentId === "string" && parentId.startsWith("qmat_")
      ? opts?.resolveLegacyQuestionId?.(parentId)
      : undefined;
    // Родитель — вопрос только с полем или легаси-резолвом: обычный тред
    // (родитель не qmat) в выжимку не идёт, даже с префиксом.
    const qid = fieldQid || (typeof legacyQid === "string" ? legacyQid : "");
    if (!qid) continue;
    const rawText = typeof m.text === "string" ? m.text.trim() : "";
    const parsed = parseAnswerReplyText(rawText);
    const record: AnswerRecord = {
      question_id: qid,
      verdict: parsed?.verdict ?? "comment",
      answered_at: typeof m.created_at === "string" && m.created_at ? m.created_at : "",
    };
    if (parsed) {
      if (parsed.choice) record.choice = parsed.choice;
      else if (parsed.single) {
        const known = opts?.choicesOf?.(qid);
        if (known && known.includes(parsed.single)) record.choice = parsed.single;
        else record.comment = parsed.single;
      }
      if (parsed.comment) record.comment = parsed.comment;
    } else if (rawText) {
      record.comment = rawText;
    } else {
      continue;
    }
    const t = finiteNum(m.anchor_sec) ?? finiteNum(parent.anchor_sec);
    if (t !== undefined && t >= 0) record.t_sec = t;
    const inSec = finiteNum(parent.start_sec);
    const outSec = finiteNum(parent.end_sec);
    if (inSec !== undefined && inSec >= 0) record.in_sec = inSec;
    if (outSec !== undefined && outSec >= 0) record.out_sec = outSec;
    const author = typeof m.author === "string" ? m.author.trim() : "";
    record.confirmed_by = author || DEFAULT_CONFIRMED_BY;
    out.push(record);
  }
  return out;
}

/**
 * tb_1791819024_26192_2: карточка следует за playhead внутри файла — запись
 * текущего файла, чьи скобки содержат t. Без скобок — null (не вопрос follow).
 * Чистая, тестируем.
 */
export function findQuestionEntryAtTime(
  entries: unknown,
  path: string | null | undefined,
  t: number | null | undefined,
): QuestionEntry | null {
  if (!Array.isArray(entries) || typeof path !== "string" || typeof t !== "number" || !Number.isFinite(t)) return null;
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as QuestionEntry;
    if (e.path !== path || typeof e.question_id !== "string" || !e.question_id) continue;
    const a = typeof e.in_sec === "number" ? e.in_sec : NaN;
    const b = typeof e.out_sec === "number" ? e.out_sec : NaN;
    if (Number.isFinite(a) && Number.isFinite(b) && b > a && t >= a && t <= b) return e;
  }
  return null;
}

/**
 * tb_1791848907_63972_2: куда (если вообще) дёргать playhead при смене
 * активного вопроса. Корень баунса cmd/shift-вперёд: follow-seek-эффект
 * в App бежит раньше follow и оценивает позицию по СТАРОМУ вопросу —
 * любой прыжок из текущего вопроса дёргался назад к его in_sec.
 * Правило: приземление внутри ЛЮБОГО вопроса — без рывка (null; карточку
 * подхватит follow), рывок к in_sec активного — только из щели (hit null),
 * когда follow никого не подхватит. Чистая, тестируем.
 * tb_1791871361_84020_1: scissorsOwnTail — ножницы ON. Выход playhead за OUT
 * активного вопроса при игре вперёд — владения tail-advance (следующее
 * видео уже едет async-аттачем); снап назад к in_sec гонялся с аттачем
 * и давал 3-5 повторов одной записи — здесь молчим (null). Ножницы OFF
 * и щель ДО in — как раньше.
 */
export function resolveQuestionSnapTime(
  entries: unknown,
  path: string | null | undefined,
  nowT: number,
  active: { question_id?: string | null; in_sec?: number; out_sec?: number } | null,
  scissorsOwnTail?: boolean,
): number | null {
  if (!active || typeof active.in_sec !== "number" || !Number.isFinite(active.in_sec)) return null;
  if (findQuestionEntryAtTime(entries, path, nowT)) return null;
  const outT = typeof active.out_sec === "number" ? active.out_sec : NaN;
  if (nowT >= active.in_sec && (Number.isNaN(outT) || nowT <= outT)) return null;
  if (scissorsOwnTail && !Number.isNaN(outT) && nowT > outT) return null;
  return active.in_sec;
}

function answerRecordKey(r: AnswerRecord): string {
  return [
    r.question_id,
    r.answered_at,
    r.verdict,
    r.choice ?? "",
    r.comment ?? "",
    r.t_sec ?? "",
    r.in_sec ?? "",
    r.out_sec ?? "",
  ].join("|");
}

/**
 * tb_1791819024_26192_2: файл = старое + выжимка (дедуп по содержимому).
 * «Плеер ответы не стирает»: легаси 0.25.54 цело, повторы не плодятся.
 */
export function mergeAnswerRecords(existing: AnswerRecord[], fresh: AnswerRecord[]): AnswerRecord[] {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(answerRecordKey));
  if (Array.isArray(fresh)) {
    for (const r of fresh) {
      if (!r || typeof r !== "object") continue;
      const k = answerRecordKey(r as AnswerRecord);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(r as AnswerRecord);
      }
    }
  }
  return out;
}

/**
 * tb_1792431205_48582_4: аутбокс ключуется путём плейлиста.
 *
 * Раньше аутбокс был один на браузер: ответы всех плейлистов лежали в одном
 * массиве, и экспорт без sibling-файла вываливал их в `<playlist>.answers.json`
 * (earcheck: 71 ответ, только 13 своих). Теперь у каждого плейлиста свой ключ;
 * легаси-массив (без ключа) принадлежит только путям без плейлиста и не
 * наследуется плейлистом с путём — иначе чужие ответы вернулись бы.
 */
const EMPTY_OUTBOX_PATH = "";

type AnswersOutboxStore = {
  version: 2;
  byPlaylist: Record<string, AnswerRecord[]>;
};

function isOutboxStore(value: unknown): value is AnswersOutboxStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as AnswersOutboxStore;
  return v.version === 2 && !!v.byPlaylist && typeof v.byPlaylist === "object";
}

function outboxKey(playlistPath?: string | null): string {
  if (typeof playlistPath === "string") return playlistPath;
  return readQuestionPlaylistPath() ?? EMPTY_OUTBOX_PATH;
}

function readOutboxStore(): AnswersOutboxStore | null {
  try {
    const raw = localStorage.getItem(QUESTION_ANSWERS_OUTBOX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isOutboxStore(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Аутбокс — снимок слияния (та же семантика, что файл), по плейлисту. */
export function writeAnswersOutbox(records: AnswerRecord[], playlistPath?: string | null): void {
  try {
    const key = outboxKey(playlistPath);
    const store = readOutboxStore() ?? { version: 2, byPlaylist: {} };
    store.byPlaylist[key] = Array.isArray(records) ? records : [];
    localStorage.setItem(QUESTION_ANSWERS_OUTBOX_KEY, JSON.stringify(store));
  } catch {
    // ignore — ответ потерян только в web без LS
  }
}

/**
 * Ответы этого плейлиста оставляет только те, что относятся к его вопросам.
 * Чужое (другие плейлисты/сессии, старьё 12–13.10) отбрасывается.
 */
export function filterAnswersToPlaylist(
  records: AnswerRecord[],
  questionIds: Iterable<string>,
): AnswerRecord[] {
  const ids = new Set<string>();
  for (const id of questionIds) if (id) ids.add(String(id));
  return (Array.isArray(records) ? records : []).filter(
    (r) => !!r && typeof r === "object" && ids.has(String((r as AnswerRecord).question_id)),
  );
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
  const caption = textOrUndefined(m.caption);
  if (caption !== undefined) out.caption = caption;
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

/** Найти запись-вопрос: точный индекс, иначе пара path+вопрос, иначе вопрос, иначе путь. */
export function findQuestionEntry(
  playlist: Playlist | null | undefined,
  opts: { questionId?: string | null; path?: string | null; entryIndex?: number | null },
): QuestionEntry | null {
  if (!playlist || !Array.isArray(playlist.entries)) return null;
  const entries = playlist.entries as QuestionEntry[];
  // tb_1791876286_57716_1: сиблинги A/B делят question_id (v07: один qid
  // на пару) — first-match по qid поднимал запись A при открытии B:
  // снап считал playhead внутри окна A и молчал, B играла с нуля.
  // trk-10 делит и path+qid — там спасает только индекс.
  const ei = opts.entryIndex;
  if (typeof ei === "number" && Number.isInteger(ei) && ei >= 0 && ei < entries.length) {
    const cand = entries[ei];
    const pathOk = opts.path == null || cand.path === opts.path;
    const qidOk = opts.questionId == null || cand.question_id === opts.questionId;
    if (pathOk && qidOk) return cand;
  }
  if (opts.questionId && opts.path) {
    const hit = entries.find((e) => e.question_id === opts.questionId && e.path === opts.path);
    if (hit) return hit;
  }
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

/**
 * tb_1791876286_57716_1: индекс записи по переданному (панель/переход) —
 * сначала валидированный entryIndex, иначе сверка полей entry
 * (path+qid+in+out различают даже сиблингов одного path+qid).
 * Возвращает индекс или -1. Чистая, тестируем.
 */
export function resolveEntryIndex(
  entries: unknown,
  opts: {
    entryIndex?: number | null;
    entry?: { path?: unknown; question_id?: unknown; in_sec?: unknown; out_sec?: unknown } | null;
    path?: string | null;
    questionId?: string | null;
  },
): number {
  if (!Array.isArray(entries)) return -1;
  const list = entries as { path?: unknown; question_id?: unknown; in_sec?: unknown; out_sec?: unknown }[];
  const ei = opts.entryIndex;
  if (typeof ei === "number" && Number.isInteger(ei) && ei >= 0 && ei < list.length) {
    const cand = list[ei];
    if (cand && typeof cand === "object" &&
        (opts.path == null || cand.path === opts.path) &&
        (opts.questionId == null || cand.question_id === opts.questionId)) {
      return ei;
    }
  }
  const e = opts.entry;
  if (e && typeof e === "object") {
    const found = list.findIndex((raw) =>
      !!raw && typeof raw === "object" &&
      (opts.path == null || raw.path === opts.path) &&
      (e.question_id == null || raw.question_id === e.question_id) &&
      (e.in_sec == null || raw.in_sec === e.in_sec) &&
      (e.out_sec == null || raw.out_sec === e.out_sec) &&
      raw.path === e.path);
    if (found >= 0) return found;
  }
  return -1;
}

/**
 * tb_1791876286_57716_1: точная активная запись одним вызовом — сначала
 * resolveEntryIndex (индекс/поля переданной записи), иначе findQuestionEntry
 * (пара path+qid, иначе qid, иначе путь). Возвращает запись и её индекс
 * (-1, когда запись опознана только переданным объектом вне списка).
 * Чистая, тестируем.
 */
export function resolveActiveEntry(
  entries: unknown,
  opts: {
    entryIndex?: number | null;
    entry?: { path?: unknown; question_id?: unknown; in_sec?: unknown; out_sec?: unknown } | null;
    path?: string | null;
    questionId?: string | null;
  },
): { entry: QuestionEntry | null; index: number } {
  const list = Array.isArray(entries) ? (entries as QuestionEntry[]) : [];
  const idx = resolveEntryIndex(entries, opts);
  if (idx >= 0 && idx < list.length) return { entry: list[idx], index: idx };
  const hit = findQuestionEntry({ entries: list } as Playlist, {
    questionId: opts.questionId ?? null,
    path: opts.path ?? null,
  });
  if (hit) return { entry: hit, index: list.indexOf(hit) };
  const ext = opts.entry;
  if (ext && typeof ext === "object" && typeof (ext as QuestionEntry).question_id === "string") {
    return { entry: ext as QuestionEntry, index: -1 };
  }
  return { entry: null, index: -1 };
}

/** Имя файла ответов рядом с плейлистом: <playlist>.answers.json */export function answersPathFor(playlistPath: string): string {
  return `${playlistPath}.answers.json`;
}

/**
 * tb_1791885959_77379_1: что положить рядом с экспортом плейлиста.
 * Вердикты/комменты оператора живут в <плейлист>.answers.json (или в
 * аутбоксе, когда пути нет) — голый экспорт entries их терял, Commander
 * не видел комментариев. Приоритет — файл у исходника, иначе аутбокс.
 * Чистая, тестируем.
 */
export function resolveExportAnswersText(
  sourceAnswersText: string | null | undefined,
  outbox: AnswerRecord[],
): string | null {
  if (typeof sourceAnswersText === "string" && sourceAnswersText.trim() !== "") {
    return sourceAnswersText;
  }
  if (Array.isArray(outbox) && outbox.length > 0) {
    return serializeAnswersFile(outbox);
  }
  return null;
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
 * tb_1792634443_73606_2, контракт Commander 22.10: answers.json — источник
 * истины для агента, а не только выжимка маркеров. Сверху лежит прогресс
 * плейлиста (все/отвеченные/ожидающие question_id), чтобы агент не гадал
 * и не поллил session.json.
 */
export interface AnswersDocument {
  answers_version: 2;
  /** id плейлиста (= id команды, если плейлист создан очередью) */
  playlist_id: string;
  /** все question_id плейлиста, в порядке записей */
  question_ids: string[];
  answered_question_ids: string[];
  pending_question_ids: string[];
  complete: boolean;
  updated_at: string;
  /** только ответы на question_id этого плейлиста */
  answers: AnswerRecord[];
}

export interface AnswersDocOptions {
  playlistId: string;
  questionIds: Iterable<string>;
  updatedAt?: string;
}

function uniqueIds(questionIds: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of questionIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Прогресс по question_id: действующий ответ = последний по answered_at. */
export function questionAnswerProgress(
  records: AnswerRecord[],
  questionIds: Iterable<string>,
): { questionIds: string[]; answeredQuestionIds: string[]; pendingQuestionIds: string[]; complete: boolean } {
  const ids = uniqueIds(questionIds);
  const active = resolveAnswers(Array.isArray(records) ? records : []);
  const answeredQuestionIds = ids.filter((id) => active.has(id));
  const pendingQuestionIds = ids.filter((id) => !active.has(id));
  return {
    questionIds: ids,
    answeredQuestionIds,
    pendingQuestionIds,
    complete: ids.length > 0 && pendingQuestionIds.length === 0,
  };
}

export function buildAnswersDocument(records: AnswerRecord[], opts: AnswersDocOptions): AnswersDocument {
  const ids = uniqueIds(opts.questionIds);
  const ownIds = new Set(ids);
  const own = filterAnswersToPlaylist(records, ownIds);
  const progress = questionAnswerProgress(own, ids);
  return {
    answers_version: 2,
    playlist_id: opts.playlistId,
    question_ids: progress.questionIds,
    answered_question_ids: progress.answeredQuestionIds,
    pending_question_ids: progress.pendingQuestionIds,
    complete: progress.complete,
    updated_at: opts.updatedAt ?? new Date().toISOString(),
    answers: own,
  };
}

export function serializeAnswersDocument(doc: AnswersDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Разбор и нового документа, и легаси `{answers: [...]}`. Прогресс
 * пересчитываем из answers: старый файл мог врать (чужие ответы).
 */
export function parseAnswersDocument(text: string | null | undefined): AnswersDocument | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
    const declared = Array.isArray(obj.question_ids)
      ? uniqueIds(obj.question_ids.filter((id): id is string => typeof id === "string"))
      : [];
    // Легаси-файл без question_ids не знает полного списка вопросов: считать
    // его complete=true нельзя (агент пропустит неотвеченное). Такой файл
    // пересобирается при открытии плейлиста и только тогда читается.
    if (!declared.length) return null;
    const records = parseAnswersFile(text);
    const playlistId = typeof obj.playlist_id === "string" ? obj.playlist_id : "";
    return buildAnswersDocument(records, {
      playlistId,
      questionIds: declared,
      updatedAt: typeof obj.updated_at === "string" && obj.updated_at ? obj.updated_at : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * tb_1792634443_73606_2: пересобрать документ из сырого файла, оставив
 * только ответы этого плейлиста. Чистая — I/O (бэкап .bak) делает App.
 */
export function sanitizeAnswersText(
  text: string | null | undefined,
  opts: Omit<AnswersDocOptions, "updatedAt"> & { updatedAt?: string },
): AnswersDocument {
  return buildAnswersDocument(parseAnswersFile(text), opts);
}

/**
 * Позиция вопроса на файле: «Вопрос 1/2 на этом файле» + следующий
 * неотвеченный. Чистая, тестируем.
 */
export function questionFilePosition(
  entries: unknown,
  path: string | null | undefined,
  questionId: string | null | undefined,
  answeredIds: Iterable<string>,
): { index: number; total: number; answered: boolean; next: QuestionEntry | null } | null {
  if (!Array.isArray(entries) || typeof path !== "string" || !path) return null;
  const onFile = entries.filter(
    (raw): raw is QuestionEntry =>
      !!raw && typeof raw === "object" &&
      (raw as QuestionEntry).path === path &&
      typeof (raw as QuestionEntry).question_id === "string" &&
      !!(raw as QuestionEntry).question_id,
  );
  if (!onFile.length) return null;
  const answered = new Set<string>();
  for (const id of answeredIds) if (id) answered.add(String(id));
  const qid = typeof questionId === "string" ? questionId : "";
  const index = onFile.findIndex((e) => e.question_id === qid);
  const next = onFile.find((e) => e.question_id !== qid && !answered.has(String(e.question_id))) ?? null;
  return {
    index: index >= 0 ? index + 1 : 0,
    total: onFile.length,
    answered: qid ? answered.has(qid) : false,
    next,
  };
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

export function readAnswersOutbox(playlistPath?: string | null): AnswerRecord[] {
  const key = outboxKey(playlistPath);
  const store = readOutboxStore();
  if (store) {
    const list = store.byPlaylist[key];
    return Array.isArray(list) ? list : [];
  }
  // Легаси-массив ключа не имел: он принадлежит только путям без плейлиста.
  if (key !== EMPTY_OUTBOX_PATH) return [];
  try {
    return parseAnswersFile(localStorage.getItem(QUESTION_ANSWERS_OUTBOX_KEY));
  } catch {
    return [];
  }
}

export function appendAnswersOutbox(next: AnswerRecord, playlistPath?: string | null): void {
  try {
    const key = outboxKey(playlistPath);
    writeAnswersOutbox([...readAnswersOutbox(key), next], key);
  } catch {
    // ignore — ответ потерян только в web без LS
  }
}
