// tb_1791586270_32802_2: материализация плейлиста-вопроса в штатные маркеры.
// tb_1791654032_27281_1: кнопки больше нет — импорт вопрос-плейлиста сразу
// пишет штатные маркеры (in/out-пары режут клипы в XML, комменты едут
// с автором agent:<роль>). Чистый модуль без DOM/LS-зависимостей.
import type { QuestionEntryFields, QuestionMarker } from "./questionPlaylist";
import { AGENT_AUTHOR_PREFIX } from "./commentAuthor";

// Полная форма штатного маркера (зеркало PlayerTimeMarker из App.tsx /
// BareMarker из панелей: лишнего не требуем, недостающего не пишем).
export interface MaterializedMarker {
  marker_id: string;
  schema_version: "cut_time_marker_v1";
  project_id: string;
  timeline_id: string;
  media_path: string;
  content_hash: string | null;
  kind: "favorite" | "negative" | "in" | "out" | "comment" | "chat";
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
  // tb_1791654032_27281_1: статуса нет — задачи живут в таскборде.
  // Старые файлы со status читаются как раньше (поле просто игнорируется).
  created_at: string;
  updated_at: string;
}

export interface MaterializeContext {
  /** media_path будущего маркера (asset-URL открытого файла). */
  mediaPath: string;
  /** Подпись: уже готовое "agent:<роль>" (см. agentAuthorFor). */
  author: string;
  now: string;
}

// id детерминированы: повторный импорт не плодит дубли — маркеры с теми же
// id просто пропускаются (см. filterNewMarkers).
function sanitizeIdPart(raw: string): string {
  const clean = String(raw ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (clean || "q").slice(0, 48);
}

export function materializedMarkerId(questionId: string, suffix: string): string {
  return `qmat_${sanitizeIdPart(questionId)}_${suffix}`;
}

/** Подпись материализованных маркеров: "agent:<кто>" (by из source плейлиста). */
export function agentAuthorFor(by: unknown): string {
  const clean = typeof by === "string" ? by.trim().slice(0, 64) : "";
  if (!clean) return `${AGENT_AUTHOR_PREFIX}agent`;
  if (clean.startsWith(AGENT_AUTHOR_PREFIX) && clean.length > AGENT_AUTHOR_PREFIX.length) return clean;
  return `${AGENT_AUTHOR_PREFIX}${clean}`;
}

function baseMarker(ctx: MaterializeContext, markerId: string): Omit<MaterializedMarker, "kind" | "start_sec" | "end_sec" | "anchor_sec" | "label" | "text"> {
  return {
    marker_id: markerId,
    schema_version: "cut_time_marker_v1",
    project_id: "cut_demo",
    timeline_id: "main",
    media_path: ctx.mediaPath,
    content_hash: null,
    score: 0.6,
    author: ctx.author,
    context_slice: null,
    cam_payload: null,
    chat_thread_id: null,
    comment_thread_id: null,
    source_engine: "player_lab",
    created_at: ctx.now,
    updated_at: ctx.now,
  };
}

const QUESTION_MARKER_KINDS = ["favorite", "negative", "in", "out", "comment", "chat"] as const;
type QuestionMarkerKind = (typeof QUESTION_MARKER_KINDS)[number];

function normalizeKind(raw: unknown): QuestionMarkerKind {
  return (QUESTION_MARKER_KINDS as readonly string[]).includes(raw as string)
    ? (raw as QuestionMarkerKind)
    : "comment";
}

/**
 * Одна запись вопроса → штатные маркеры: in (in_sec), out (out_sec),
 * комменты из entry.markers. Пустая запись (нет question_id) — [].
 * out без валидного in или out<=in пропускается (ломаную пару не пишем),
 * in-одиночка и комменты — пишутся.
 */
export function materializeQuestionEntry(
  entry: QuestionEntryFields,
  ctx: MaterializeContext,
): MaterializedMarker[] {
  if (!entry || typeof entry !== "object") return [];
  const qid = typeof entry.question_id === "string" ? entry.question_id.trim() : "";
  if (!qid) return [];
  const out: MaterializedMarker[] = [];
  const question = typeof entry.question === "string" ? entry.question.trim() : "";
  const hypothesis = typeof entry.hypothesis === "string" ? entry.hypothesis.trim() : "";
  const inSec = typeof entry.in_sec === "number" && Number.isFinite(entry.in_sec) && entry.in_sec >= 0
    ? entry.in_sec
    : undefined;
  const outSec = typeof entry.out_sec === "number" && Number.isFinite(entry.out_sec) && entry.out_sec >= 0
    ? entry.out_sec
    : undefined;
  if (inSec !== undefined) {
    out.push({
      ...baseMarker(ctx, materializedMarkerId(qid, "in")),
      kind: "in",
      start_sec: inSec,
      end_sec: inSec,
      anchor_sec: inSec,
      label: qid.slice(0, 120),
      text: question,
    });
  }
  if (outSec !== undefined && inSec !== undefined && outSec > inSec) {
    out.push({
      ...baseMarker(ctx, materializedMarkerId(qid, "out")),
      kind: "out",
      start_sec: outSec,
      end_sec: outSec,
      anchor_sec: outSec,
      label: qid.slice(0, 120),
      text: question,
    });
  }
  const markers: QuestionMarker[] = Array.isArray(entry.markers) ? entry.markers : [];
  markers.forEach((m, i) => {
    if (!m || typeof m !== "object") return;
    const t = typeof m.t_sec === "number" && Number.isFinite(m.t_sec) && m.t_sec >= 0 ? m.t_sec : undefined;
    if (t === undefined) return;
    const kind = normalizeKind(m.kind);
    const mText = typeof m.text === "string" ? m.text.trim() : "";
    out.push({
      ...baseMarker(ctx, materializedMarkerId(qid, `c${i}`)),
      kind,
      start_sec: t,
      end_sec: t,
      anchor_sec: t,
      label: (question || qid).slice(0, 120),
      text: hypothesis ? (mText ? `${hypothesis} — ${mText}` : hypothesis) : mText,
    });
  });
  return out;
}

/** Сколько записей плейлиста готовы к материализации (есть question_id). */
export function countMaterializable(entries: unknown): number {
  if (!Array.isArray(entries)) return 0;
  return entries.filter(
    (e) => e !== null && typeof e === "object" &&
      typeof (e as { question_id?: unknown }).question_id === "string" &&
      (e as { question_id: string }).question_id.trim() !== "",
  ).length;
}

/** Вычесть уже существующие id (повторный импорт — без дублей). */
export function filterNewMarkers(
  existingIds: Set<string>,
  markers: MaterializedMarker[],
): MaterializedMarker[] {
  return markers.filter((m) => !existingIds.has(m.marker_id));
}
