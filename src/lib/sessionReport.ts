// tb_1792532431_93509_9: отчёт о показе <плейлист>.session.json (решение
// Commander 21.10 по разведке RECON_PLAYER_FOR_AGENT §5). Отдельный файл,
// а не поле в answers.json: answers.json — выжимка маркеров, её пересобирает
// код на каждый ответ (§5.1 манифеста); подмешивать туда «досмотрел до»
// значит завести второго писателя. Писатель здесь один — плеер.
//
// Агенту отдаём только пути записей плейлиста: ни localStorage, ни системных
// путей, ни путей вне плейлиста (санитайз — buildSessionReport).

export const SESSION_VERSION = 1;

export const SESSION_MARK_KINDS = ["favorite", "negative", "in", "out", "comment", "chat"] as const;
export type SessionMarkKind = (typeof SESSION_MARK_KINDS)[number];

export interface SessionReach {
  entry_index: number;
  t_sec: number;
}

export interface SessionMark {
  kind: SessionMarkKind;
  t_sec: number;
}

export interface SessionReport {
  session_version: typeof SESSION_VERSION;
  playlist: string;
  started_at: string;
  updated_at: string;
  entry_index: number;
  question_id: string | null;
  path: string | null;
  t_sec: number;
  playing: boolean;
  reached: SessionReach[];
  answers: number;
  marks: SessionMark[];
}

/** Минимум записи плейлиста, по которому считается «свой» путь. */
export interface SessionEntryRef {
  path?: unknown;
  question_id?: unknown;
}

export interface SessionInput {
  playlist: string;
  startedAt: string;
  updatedAt?: string;
  entryIndex?: number | null;
  questionId?: string | null;
  path?: string | null;
  tSec?: number | null;
  playing?: boolean;
  reached?: SessionReach[] | null;
  answers?: number | null;
  marks?: SessionMark[] | null;
  entries?: SessionEntryRef[] | null;
}

/** Имя файла отчёта рядом с плейлистом: <playlist>.session.json */
export function sessionPathFor(playlistPath: string): string {
  return `${playlistPath}.session.json`;
}

function finiteOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function entryList(entries: SessionEntryRef[] | null | undefined): SessionEntryRef[] {
  return Array.isArray(entries) ? entries.filter((e) => !!e && typeof e === "object") : [];
}

function pathOf(entry: SessionEntryRef | undefined): string | null {
  if (!entry) return null;
  const p = entry.path;
  return typeof p === "string" && p.length > 0 ? p : null;
}

function questionIdOf(entry: SessionEntryRef | undefined): string | null {
  if (!entry) return null;
  const q = entry.question_id;
  return typeof q === "string" && q.length > 0 ? q : null;
}

/** Индекс записи плейлиста с этим путём (-1, если путь чужой). */
export function sessionEntryIndexOf(entries: SessionEntryRef[] | null | undefined, path: string | null): number {
  if (!path) return -1;
  return entryList(entries).findIndex((e) => pathOf(e) === path);
}

function sanitizeReached(reached: SessionReach[] | null | undefined, entries: SessionEntryRef[]): SessionReach[] {
  if (!Array.isArray(reached)) return [];
  const byIndex = new Map<number, number>();
  for (const item of reached) {
    if (!item || typeof item !== "object") continue;
    const idx = Number(item.entry_index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= entries.length) continue;
    if (!pathOf(entries[idx])) continue;
    const t = Number(item.t_sec);
    if (!Number.isFinite(t) || t < 0) continue;
    byIndex.set(idx, Math.max(byIndex.get(idx) ?? 0, t));
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([entry_index, t_sec]) => ({ entry_index, t_sec }));
}

function sanitizeMarks(marks: SessionMark[] | null | undefined, ownPath: string | null): SessionMark[] {
  if (!ownPath || !Array.isArray(marks)) return [];
  const out: SessionMark[] = [];
  for (const mark of marks) {
    if (!mark || typeof mark !== "object") continue;
    if (!SESSION_MARK_KINDS.includes(mark.kind)) continue;
    const t = Number(mark.t_sec);
    if (!Number.isFinite(t) || t < 0) continue;
    out.push({ kind: mark.kind, t_sec: t });
  }
  return out;
}

/**
 * Отчёт ровно по контракту §5. Всё, что не принадлежит плейлисту,
 * отбрасывается: чужой path → null, чужие reached/marks → пусто.
 */
export function buildSessionReport(input: SessionInput): SessionReport {
  const entries = entryList(input.entries);
  const requestedPath = typeof input.path === "string" && input.path.length > 0 ? input.path : null;
  const ownIndex = sessionEntryIndexOf(entries, requestedPath);
  const path = ownIndex >= 0 ? requestedPath : null;
  const ownEntry = ownIndex >= 0 ? entries[ownIndex] : undefined;

  // Честный -1: активной записи нет (конец показа, закрытие, чужой path).
  // Документ §5.4 манифеста обещает -1 — не подменяем его нулём.
  const entryIndex = ownIndex;

  const requestedQid = typeof input.questionId === "string" && input.questionId.length > 0 ? input.questionId : null;
  const qidFromEntry = questionIdOf(ownEntry);
  const qidExists = requestedQid
    ? entries.some((e) => questionIdOf(e) === requestedQid)
    : false;
  const questionId = qidFromEntry ?? (qidExists ? requestedQid : null);

  return {
    session_version: SESSION_VERSION,
    playlist: input.playlist,
    started_at: input.startedAt,
    updated_at: typeof input.updatedAt === "string" && input.updatedAt.length > 0 ? input.updatedAt : input.startedAt,
    entry_index: entryIndex,
    question_id: questionId,
    path,
    t_sec: finiteOrZero(input.tSec),
    playing: input.playing === true,
    reached: sanitizeReached(input.reached, entries),
    answers: Math.trunc(finiteOrZero(input.answers)),
    marks: sanitizeMarks(input.marks, path),
  };
}

/** Перезапись, не дописывание: файл всегда ровно один отчёт. */
export function serializeSessionReport(report: SessionReport): string {
  return JSON.stringify(report, null, 2);
}

export function parseSessionReport(text: string | null | undefined): SessionReport | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isSessionReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isSessionReport(raw: unknown): raw is SessionReport {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (r.session_version !== SESSION_VERSION) return false;
  if (typeof r.playlist !== "string" || r.playlist.length === 0) return false;
  if (typeof r.started_at !== "string" || typeof r.updated_at !== "string") return false;
  if (!Number.isInteger(r.entry_index) || (r.entry_index as number) < -1) return false;
  if (r.question_id !== null && typeof r.question_id !== "string") return false;
  if (r.path !== null && typeof r.path !== "string") return false;
  if (typeof r.t_sec !== "number" || !Number.isFinite(r.t_sec)) return false;
  if (typeof r.playing !== "boolean") return false;
  if (!Array.isArray(r.reached) || !Array.isArray(r.marks)) return false;
  if (typeof r.answers !== "number" || !Number.isFinite(r.answers)) return false;
  return true;
}

export interface SessionWriterDeps {
  writeTextFile?: (path: string, contents: string) => Promise<unknown>;
}

/**
 * Пишет отчёт в sessionPathFor(playlist) и только туда: файл ответов
 * (выжимку §5.1) этот модуль не импортирует вовсе — второго писателя нет.
 */
export async function writeSessionReport(
  report: SessionReport,
  deps: SessionWriterDeps = {},
): Promise<string> {
  const target = sessionPathFor(report.playlist);
  const write = deps.writeTextFile ?? (async (path: string, contents: string) => {
    const fs = await import("@tauri-apps/plugin-fs");
    await fs.writeTextFile(path, contents);
  });
  await write(target, serializeSessionReport(report));
  return target;
}
