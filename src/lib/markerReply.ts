// tb_1791809796_24701_1: один конструктор reply-маркера на оба окна.
// Канон «одна правда — маркеры»: карточка вопроса (главное окно) и кнопка ↳
// (окно Markers) зовут его; персист — у звонящих. Чистый модуль, без Tauri/LS.
// tb_1791837678_26192_1: вердикт = тип маркера. Карточка вопроса пишет reply
// видом вердикта (Confirm→favorite ★, Reject→negative ✕, Not sure→comment) —
// мимо кнопки видно глазом на таймлайне и в Comments. Окно Markers (кнопка ↳)
// вердикта не знает — там kind по умолчанию comment. Выжимка answersFromMarkers
// текст-driven и от kind не зависит; Premiere-цвета видов штатные (0.10.27 E2E).

/** Вид reply-маркера: вердикт карточки или comment из окна. */
export type ReplyMarkerKind = "comment" | "favorite" | "negative";

// Легаси-префикс id маркеров вопроса (до поля question_id).
export const QUESTION_MARKER_ID_PREFIX = "qmat_";

/** Минимум, нужный конструктору и выжимке (оба окна структурно подходят). */
export interface ReplyParent {
  marker_id: string;
  start_sec?: number | null;
  end_sec?: number | null;
  anchor_sec?: number | null;
  media_path?: string | null;
  author?: string | null;
  content_hash?: string | null;
  /** поле qmat-маркера (tb_1791809796); у старых — только id-префикс. */
  question_id?: string | null;
}

/** Родитель — маркер вопроса: поле question_id, иначе легаси-префикс id. */
export function isQuestionMarker(parentId: string | null | undefined, questionIdField?: string | null): boolean {
  if (typeof questionIdField === "string" && questionIdField.trim() !== "") return true;
  return typeof parentId === "string" && parentId.startsWith(QUESTION_MARKER_ID_PREFIX);
}

/**
 * Подпись ответа: свой автор побеждает; пустой — fallback на автора родителя,
 * КРОМЕ qmat-родителей (там agent:Beta — чужая подпись, Commander: запрет).
 */
export function resolveReplyAuthorForParent(
  own: string | null | undefined,
  parent: { marker_id?: string | null; author?: string | null; question_id?: string | null } | null | undefined,
): string {
  const mine = typeof own === "string" ? own.trim() : "";
  if (mine) return mine;
  if (!parent || typeof parent !== "object") return "";
  if (isQuestionMarker(parent.marker_id, parent.question_id)) return "";
  return typeof parent.author === "string" ? parent.author.trim() : "";
}

export function createReplyId(): string {
  return `reply_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function finiteOr(finite: number | null | undefined, fallback: number): number {
  return typeof finite === "number" && Number.isFinite(finite) ? finite : fallback;
}

/** Полный reply-маркер (форма PlayerTimeMarker; окно Markers хранит как BareMarker — лишние поля едут в JSON и нужны выжимке). */
export interface BuiltReplyMarker {
  marker_id: string;
  schema_version: "cut_time_marker_v1";
  project_id: string;
  timeline_id: string;
  media_path: string;
  content_hash: string | null;
  kind: ReplyMarkerKind;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  score: number;
  label: string;
  text: string;
  author: string;
  context_slice: null;
  cam_payload: null;
  chat_thread_id: null;
  comment_thread_id: null;
  source_engine: string;
  reply_to: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface BuildReplyInput {
  parent: ReplyParent | null | undefined;
  text: string;
  author: string;
  label: string;
  now: string;
  /**
   * Вид маркера: карточка передаёт вердикт (favorite/negative/comment),
   * окно Markers не передаёт — comment. Новых сущностей нет, виды штатные.
   */
  kind?: ReplyMarkerKind;
  /**
   * Секунда playhead в момент ответа (t_sec выжимки). Знает только карточка
   * главного окна; окно Markers не знает — там anchor родителя.
   */
  playheadSec?: number | null;
}

/**
 * Ответ — в спане родителя (группировка), anchor — playhead, если известен.
 * Родителя нет — null (звонящий решает: молча пропустить или тост).
 */
export function buildReplyMarkerFull(input: BuildReplyInput): BuiltReplyMarker | null {
  const parent = input.parent;
  if (!parent || typeof parent !== "object" || typeof parent.marker_id !== "string" || !parent.marker_id) return null;
  const parentAnchor = finiteOr(parent.anchor_sec ?? parent.start_sec ?? 0, 0);
  const anchorFallback = parentAnchor >= 0 ? parentAnchor : 0;
  const ph = typeof input.playheadSec === "number" ? input.playheadSec : NaN;
  const anchor = Number.isFinite(ph) && ph >= 0 ? ph : anchorFallback;
  const start = finiteOr(parent.start_sec, anchorFallback);
  const end = finiteOr(parent.end_sec ?? parent.start_sec, anchorFallback);
  return {
    marker_id: createReplyId(),
    schema_version: "cut_time_marker_v1",
    project_id: "cut_demo",
    timeline_id: "main",
    media_path: typeof parent.media_path === "string" ? parent.media_path : "",
    content_hash: typeof parent.content_hash === "string" ? parent.content_hash : null,
    kind: input.kind ?? "comment",
    start_sec: start,
    end_sec: end,
    anchor_sec: anchor,
    score: 0.6,
    label: input.label,
    text: input.text,
    author: input.author,
    context_slice: null,
    cam_payload: null,
    chat_thread_id: null,
    comment_thread_id: null,
    source_engine: "player_lab",
    reply_to: parent.marker_id,
    created_at: input.now,
    updated_at: nowSafe(input.now),
  };
}

function nowSafe(now: string): string {
  return typeof now === "string" && now.length > 0 ? now : new Date().toISOString();
}
