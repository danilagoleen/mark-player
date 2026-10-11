// tb_1791583578_64923_1: автор комментария + статус open/done.
// Чистый модуль: LS-имя подписанта, нормализация, статусы.
// Человек подписывается пассивно (имя macOS один раз подтвердить),
// агент — сам: agent:<роль> (это и есть пометка «ИИ», протокол §4 п.7).

export const COMMENT_AUTHOR_STORAGE_KEY = "vetka_player_lab_comment_author_v1";
// Имя предложили один раз (даже если оставили пустым) — больше не спрашивать.
const COMMENT_AUTHOR_ASKED_KEY = "vetka_player_lab_comment_author_asked_v1";

export type CommentStatus = "open" | "done";

export const AGENT_AUTHOR_PREFIX = "agent:";

/** Автор-агент: agent:Beta, agent:phi, … */
export function isAgentAuthor(author: string | null | undefined): boolean {
  return typeof author === "string" && author.startsWith(AGENT_AUTHOR_PREFIX) && author.length > AGENT_AUTHOR_PREFIX.length;
}

/** Чистка имени: trim, кап 64, не-строка → "". */
export function normalizeAuthorName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 64);
}

/** Статус из хранилища: только "done" — done, всё остальное — open. */
export function normalizeMarkerStatus(raw: unknown): CommentStatus {
  return raw === "done" ? "done" : "open";
}

export interface CommentAuthorState {
  /** чем подписывать новые маркеры ("" — как раньше, без автора) */
  name: string;
  /** false — при первом комментарии один раз предложить поправить */
  confirmed: boolean;
}

/**
 * Состояние подписанта: запомненное имя побеждает; иначе предложение
 * из ОС (Tauri os_username); иначе пусто. Подтверждено — только если
 * имя правили/подтверждали явно.
 */
export function resolveCommentAuthor(storedName: unknown, osName: unknown): CommentAuthorState {
  const stored = normalizeAuthorName(storedName);
  if (stored) return { name: stored, confirmed: true };
  const suggestion = normalizeAuthorName(osName);
  if (suggestion) return { name: suggestion, confirmed: false };
  return { name: "", confirmed: false };
}

export function loadCommentAuthorName(): string {
  try {
    const raw = localStorage.getItem(COMMENT_AUTHOR_STORAGE_KEY);
    if (!raw) return "";
    return normalizeAuthorName(JSON.parse(raw));
  } catch {
    return "";
  }
}

export function saveCommentAuthorName(name: string): void {
  try {
    localStorage.setItem(COMMENT_AUTHOR_STORAGE_KEY, JSON.stringify(normalizeAuthorName(name)));
  } catch {
    // ignore — имя просто не запомнится
  }
}

export function wasCommentAuthorAsked(): boolean {
  try {
    return localStorage.getItem(COMMENT_AUTHOR_ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCommentAuthorAsked(): void {
  try {
    localStorage.setItem(COMMENT_AUTHOR_ASKED_KEY, "1");
  } catch {
    // ignore
  }
}

// tb_1791754893_1275_4: чистая разборка ответа prompt (тестируем): пустое /
// отмена — НЕ сохраняем и asked НЕ ставим (переспросит в следующий раз,
// иначе Esc = вечный безымянный автор). Не-пустое — сохранить + asked.
export interface AuthorPromptOutcome {
  /** чем подписать этот маркер */
  name: string;
  /** класть ли в LS */
  save: boolean;
  /** ставить ли asked-флаг */
  markAsked: boolean;
}

export function applyAuthorPromptResult(current: string, answer: string | null): AuthorPromptOutcome {
  if (answer === null) return { name: current, save: false, markAsked: false };
  const clean = answer.trim().slice(0, 64);
  if (!clean) return { name: current, save: false, markAsked: false };
  return { name: clean, save: true, markAsked: true };
}

// tb_1791754893_1275_4: подпись ответа: свой автор побеждает; пустой —
// fallback на автора родителя (ответ без подписи не уходит никому).
export function resolveReplyAuthor(own: string | null | undefined, parent: string | null | undefined): string {
  const mine = typeof own === "string" ? own.trim() : "";
  if (mine) return mine;
  const theirs = typeof parent === "string" ? parent.trim() : "";
  return theirs;
}

// tb_1791585558_31907_1: reply-средний. Ответ — отдельный комментарий,
// ссылка на родителя — marker_id. В SRT ссылка едет префиксом текста
// `↳ <marker_id>: <текст>` (старый плеер читает как обычный коммент).
export const REPLY_PREFIX = "↳";

const REPLY_TEXT_RE = /^↳\s*([^\s:]{1,128})\s*:\s*([\s\S]*)$/;

/** reply_to из поля sidecar/JSON: непустая строка ≤128, иначе undefined. */
export function normalizeReplyTo(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t || t.length > 128 || /\s/.test(t)) return undefined;
  return t;
}

/**
 * Выделяет ссылку из текста SRT-ответа. Вернёт replyTo + чистый текст;
 * без префикса — replyTo undefined, текст как есть.
 */
export function parseReplyText(text: string): { replyTo: string | undefined; text: string } {
  const m = REPLY_TEXT_RE.exec(text);
  if (!m) return { replyTo: undefined, text };
  return { replyTo: m[1], text: m[2].trim() };
}

/** Собирает текст SRT-ответа обратно (round-trip). */
export function formatReplyText(replyTo: string, text: string): string {
  return `${REPLY_PREFIX} ${replyTo}: ${text}`;
}
