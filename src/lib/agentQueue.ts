// tb_1792536109_79489_5 — контракт очереди команд агента (шаг 2).
//
// Разведка RECON_PLAYER_FOR_AGENT_2026-10-21 §3, вариант B: агент кладёт
// <id>.cmd.json в inbox/, плеер отвечает <id>.ack.json. Здесь — чистые
// функции контракта (тестируются без окна и Tauri): разбор команды,
// срок жизни, имя файлов, ack, inline-плейлист. Валидацию путей и
// запись ack на структурные ошибки делает Rust (command_queue.rs);
// App исполняет глагол и дописывает ack о результате.
import type { PlaylistEntry } from "./playlist";
import { QUESTION_PLAYLIST_SCHEMA, type QuestionEntryFields } from "./questionPlaylist";

export const QUEUE_CMD_VERSION = 1;
export const QUEUE_ACK_VERSION = 1;
export const QUEUE_EVENT_NAME = "vetka-command";

/** Глаголы шага 2 (разведка §6 п.2) — тот же список, что в Rust VERBS. */
export const QUEUE_VERBS = [
  "open_playlist",
  "open_file",
  "seek",
  "play_range",
  "next",
  "pause",
] as const;

export type QueueVerb = (typeof QUEUE_VERBS)[number];

export interface AgentCommand {
  cmd_version: typeof QUEUE_CMD_VERSION;
  id: string;
  verb: QueueVerb;
  args: Record<string, unknown>;
  created_at?: string;
  expires_at?: string;
  author?: string;
}

export interface AgentAckError {
  code: string;
  message: string;
}

export interface AgentAck {
  ack_version: typeof QUEUE_ACK_VERSION;
  id: string;
  verb: string | null;
  status: "done" | "error" | "expired";
  at: string;
  error?: AgentAckError;
}

export interface AgentCommandEvent {
  cmd_path: string;
  ack_path: string;
  playlists_dir: string;
  cmd: unknown;
}

export type ParseResult =
  | { ok: true; cmd: AgentCommand }
  | { ok: false; code: string; message: string };

/** id = имя файла без .cmd.json: только безопасные символы, без путей. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isQueueId(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value) && !value.includes("..");
}

export function commandFileName(id: string): string {
  return `${id}.cmd.json`;
}

export function ackFileName(id: string): string {
  return `${id}.ack.json`;
}

/**
 * tb_1792634443_73606_2: сигнал агенту об ответах — отдельный файл в ack/,
 * рядом с ack глагола (не затирает его). Имя — по id команды.
 */
export function answersAckFileName(id: string): string {
  return `${id}.answers.json`;
}

/**
 * id команды из id плейлиста: inline-плейлист очереди зовётся `queue_<cmd>`
 * (inlinePlaylistForCommand), а файл сигнала агент ждёт по `<cmd>.answers.json`.
 */
export function commandIdForPlaylistId(playlistId: string): string {
  const raw = typeof playlistId === "string" ? playlistId.trim() : "";
  const stripped = raw.startsWith("queue_") ? raw.slice("queue_".length) : raw;
  const safe = stripped.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+/, "");
  return safe || "playlist";
}

/** Путь плейлиста → id команды, которой он создан (для ack/<cmd>.answers.json). */
export const QUESTION_COMMAND_ID_KEY = "vetka_player_lab_question_command_v1";

function readCommandIdMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(QUESTION_COMMAND_ID_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function readQuestionCommandId(playlistPath: string | null | undefined): string | null {
  if (!playlistPath) return null;
  try {
    const id = readCommandIdMap()[playlistPath];
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

export function rememberQuestionCommandId(playlistPath: string | null | undefined, commandId: string): void {
  if (!playlistPath || !isQueueId(commandId)) return;
  try {
    const map = readCommandIdMap();
    map[playlistPath] = commandId;
    localStorage.setItem(QUESTION_COMMAND_ID_KEY, JSON.stringify(map));
  } catch {
    // ignore — без карты возьмём id из playlist_id
  }
}

export function parseAgentCommand(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_command", message: "команда должна быть объектом" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.cmd_version !== QUEUE_CMD_VERSION) {
    return {
      ok: false,
      code: "unsupported_version",
      message: `cmd_version=${String(obj.cmd_version)}, ожидается ${QUEUE_CMD_VERSION}`,
    };
  }
  if (!isQueueId(obj.id)) {
    return { ok: false, code: "invalid_id", message: "id должен быть именем файла (без слэшей и ..)" };
  }
  if (typeof obj.verb !== "string" || !(QUEUE_VERBS as readonly string[]).includes(obj.verb)) {
    return {
      ok: false,
      code: "unknown_verb",
      message: `глагол ${String(obj.verb)} не из очереди шага 2: ${QUEUE_VERBS.join(", ")}`,
    };
  }
  if (obj.args !== undefined && (typeof obj.args !== "object" || obj.args === null || Array.isArray(obj.args))) {
    return { ok: false, code: "invalid_args", message: "args должен быть объектом" };
  }
  if (obj.expires_at !== undefined && !isIsoUtc(obj.expires_at)) {
    return { ok: false, code: "invalid_expires_at", message: "expires_at должен быть ISO-8601 UTC" };
  }
  return { ok: true, cmd: { ...(obj as unknown as AgentCommand), args: (obj.args as Record<string, unknown>) ?? {} } };
}

function isIsoUtc(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value)) && /T.*(Z|[+-]\d{2}:\d{2})$/i.test(value.trim());
}

/** Просроченная команда не исполняется (Rust проверяет раньше; здесь — для тестов и веба). */
export function isAgentCommandExpired(cmd: Pick<AgentCommand, "expires_at">, nowMs: number = Date.now()): boolean {
  if (!cmd.expires_at) return false;
  const at = Date.parse(cmd.expires_at);
  if (Number.isNaN(at)) return true;
  return at <= nowMs;
}

/**
 * Уже исполненная команда: ack лежит в памяти окна, глагол повторно не
 * исполняется — Rust переотправляет emit, пока файл ack не появился, и
 * подписка могла не успеть. Возвращаем сохранённый ack (байт-в-байт),
 * чтобы переписать его на тот же путь.
 */
export function cachedAckFor(
  handled: ReadonlyMap<string, string>,
  cmd: Pick<AgentCommand, "id"> | string,
): string | null {
  const id = typeof cmd === "string" ? cmd : cmd.id;
  const cached = handled.get(id);
  return cached === undefined ? null : cached;
}

/** Запоминает ack исполненной команды — ключ идемпотентности по id. */
export function rememberAck(handled: Map<string, string>, id: string, ackText: string): void {
  handled.set(id, ackText);
}

export function buildAck(input: {
  id: string;
  verb?: string | null;
  status: AgentAck["status"];
  error?: AgentAckError;
  at?: string;
}): AgentAck {
  const ack: AgentAck = {
    ack_version: QUEUE_ACK_VERSION,
    id: input.id,
    verb: input.verb ?? null,
    status: input.status,
    at: input.at ?? new Date().toISOString(),
  };
  if (input.error) ack.error = { code: input.error.code, message: input.error.message };
  return ack;
}

export function serializeAck(ack: AgentAck): string {
  return JSON.stringify(ack, null, 2);
}

/** Строка для человека — не молчание (приёмка очереди). */
export function describeAck(ack: AgentAck): string {
  const verb = ack.verb ?? "command";
  if (ack.status === "done") return `Agent: ${verb} — done.`;
  if (ack.status === "expired") return `Agent: ${verb} — expired, not executed.`;
  return `Agent: ${verb} — ${ack.error?.code ?? "error"}: ${ack.error?.message ?? "failed"}.`;
}

export interface InlinePlaylist {
  id: string;
  name: string;
  schema: string;
  source: { by: string; task?: string; layer?: string };
  entries: (PlaylistEntry & QuestionEntryFields)[];
  createdAt: string;
}

function entryName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/**
 * Inline-плейлист из команды open_playlist { entries }: агент создаёт
 * подборку с in/out и формой вопроса, не сочиняя файл руками. Плеер
 * сохраняет её в playlists/queue_<id>.playlist.json — ответы человека
 * лягут рядом (<файл>.answers.json), как у обычного плейлиста.
 */
export function inlinePlaylistForCommand(cmd: AgentCommand): InlinePlaylist | null {
  const entries = cmd.args.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const at = new Date().toISOString();
  const normalized: (PlaylistEntry & QuestionEntryFields)[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const path = typeof entry.path === "string" ? entry.path : "";
    if (!path) continue;
    normalized.push({
      ...(entry as unknown as QuestionEntryFields),
      path,
      name: typeof entry.name === "string" && entry.name ? entry.name : entryName(path),
      duration: typeof entry.duration === "number" && Number.isFinite(entry.duration) ? entry.duration : 0,
      addedAt: typeof entry.addedAt === "string" && entry.addedAt ? entry.addedAt : at,
    });
  }
  if (normalized.length === 0) return null;
  const by =
    typeof cmd.args.by === "string" && cmd.args.by ? cmd.args.by : cmd.author || "agent";
  return {
    id: `queue_${cmd.id}`,
    name: typeof cmd.args.name === "string" && cmd.args.name ? cmd.args.name : `Agent playlist ${cmd.id}`,
    schema: QUESTION_PLAYLIST_SCHEMA,
    source: {
      by,
      ...(typeof cmd.args.task === "string" && cmd.args.task ? { task: cmd.args.task } : {}),
      ...(typeof cmd.args.layer === "string" && cmd.args.layer ? { layer: cmd.args.layer } : {}),
    },
    entries: normalized,
    createdAt: at,
  };
}

/** Проверка числового аргумента очереди (seek/play_range/pause). */
export function numericArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}
