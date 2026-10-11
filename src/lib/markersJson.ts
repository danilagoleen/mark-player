import { normalizeReplyTo } from "./commentAuthor";

// markersJson.ts — чистая нормализация импорта Markers (JSON).
// tb_1791146800_70644_20: текст едет у маркера ЛЮБОГО вида (buildMarker(kind, text)
// принимает text всегда) — маппинг m.text || m.label живёт здесь, а не инлайном
// в App.tsx, чтобы round-trip fav/neg с текстом был покрыт тестом.

export type ImportableMarkerKind = "favorite" | "negative" | "in" | "out" | "comment" | "chat";

const KNOWN_KINDS: ImportableMarkerKind[] = ["favorite", "negative", "in", "out", "comment", "chat"];

export interface NormalizedMarkerImport {
  kind: ImportableMarkerKind;
  text: string;
  /** tb_1791583578_64923_1: автор из файла (agent:<роль> — пометка «ИИ”). */
  author?: string;
  /** tb_1791585558_31907_1: ссылка на родителя (ответ). */
  reply_to?: string;
  anchorSec?: number;
  startSec?: number;
  endSec?: number;
}

function textOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim().slice(0, 64);
  return t.length > 0 ? t : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Нормализует одну сырую запись из Markers JSON. Не-объект → null (пропустить). */
export function normalizeImportedMarker(entry: unknown): NormalizedMarkerImport | null {
  if (!entry || typeof entry !== "object") return null;
  const m = entry as Record<string, unknown>;
  const kind = KNOWN_KINDS.includes(m.kind as ImportableMarkerKind)
    ? (m.kind as ImportableMarkerKind)
    : "favorite";
  const rawText = m.text ?? m.label ?? "";
  const text = typeof rawText === "string" ? rawText : String(rawText);
  const anchorSec = finiteNumber(m.anchor_sec ?? m.time);
  const startSec = finiteNumber(m.start_sec);
  const endSec = finiteNumber(m.end_sec);
  const norm: NormalizedMarkerImport = { kind, text };
  const author = textOrUndefined(m.author);
  if (author !== undefined) norm.author = author;
  const replyTo = normalizeReplyTo(m.reply_to);
  if (replyTo !== undefined) norm.reply_to = replyTo;
  if (anchorSec !== undefined) norm.anchorSec = anchorSec;
  if (startSec !== undefined) norm.startSec = startSec;
  if (endSec !== undefined) norm.endSec = endSec;
  return norm;
}
