// tb_1792634443_73606_2: файловый контракт ответов плейлиста-вопроса.
//
// <playlist>.answers.json — источник истины для агента (контракт Commander
// 22.10): сверху прогресс (question_ids / answered / pending / complete),
// внутри — только ответы на вопросы ЭТОГО плейлиста. При первом открытии
// старый файл (улики v03) сохраняется рядом как .bak один раз.
//
// Сигнал агенту — копия документа в <app data>/ack/<cmd>.answers.json
// с sent_by=operator|auto. Он не затирает <cmd>.ack.json глагола.

import {
  answersPathFor,
  buildAnswersDocument,
  parseAnswersFile,
  serializeAnswersDocument,
  type AnswerRecord,
  type AnswersDocument,
} from "./questionPlaylist";

export type AnswersSentBy = "operator" | "auto";

/**
 * tb_1795498927_72599_1: корни, куда плеер может ПИСАТЬ рядом с плейлистом
 * (answers.json, session.json). Одно место правды для текста отказа и манифеста:
 * тест capabilitiesScope.test.ts сверяет список с src-tauri/capabilities/default.json.
 * Плейлист вне этих корней открывается (диалог даёт чтение), но писать рядом нельзя.
 */
export const PLAYER_WRITE_ROOTS: readonly string[] = ["$HOME", "/Volumes", "$TEMP", "/private/tmp", "/tmp"];

/** Сколько висит громкий отказ записи: текст с путями и выходом читают дольше 6.5с общего тоста. */
export const WRITE_FAIL_TOAST_MS = 20000;

/** Что не записалось: файл ответов, отчёт о показе (session.json) или отправка агенту. */
export type AnswersWriteStage = "open" | "answer" | "send" | "session";

function reasonText(reason: unknown): string {
  if (reason == null || reason === "") return "";
  const raw = typeof reason === "string" ? reason : reason instanceof Error ? reason.message : String(reason);
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return ` (${clean.length > 160 ? `${clean.slice(0, 157)}...` : clean})`;
}

/**
 * Громкий отказ записи рядом с плейлистом (находка Phi 24.11: плейлист из
 * /private/tmp открывался, ответы ложились маркерами, а файлов не было, и никто
 * не знал). Текст называет папку и файл, что ответы только маркеры и куда
 * плейлист переложить.
 */
export function answersWriteFailureText(
  playlistPath: string,
  stage: AnswersWriteStage,
  reason?: unknown,
): string {
  const cut = Math.max(playlistPath.lastIndexOf("/"), playlistPath.lastIndexOf("\\"));
  const dir = cut > 0 ? playlistPath.slice(0, cut) : ".";
  const base = cut >= 0 ? playlistPath.slice(cut + 1) : playlistPath;
  const file = `${base}${stage === "session" ? ".session.json" : ".answers.json"}`;
  const where = `${file} in ${dir}`;
  const roots = PLAYER_WRITE_ROOTS.join(", ");
  const fix = `The player can write only under ${roots}. Copy the playlist there and open it again.`;
  const why = reasonText(reason);
  if (stage === "session") {
    return `Session report not written: cannot write ${where}. The agent will not see where you stopped. ${fix}${why}`;
  }
  const lead =
    stage === "open"
      ? `Answers cannot be saved next to this playlist: cannot write ${where}.`
      : stage === "send"
        ? `Send to agent failed: cannot write ${where}.`
        : `Answer kept as a marker only: cannot write ${where}.`;
  return `${lead} Answers stay as markers only, the agent will not get the file. ${fix}${why}`;
}

export interface SanitizeAnswersResult {
  doc: AnswersDocument;
  /** сколько чужих записей выкинуто при санитайзе */
  foreignRemoved: number;
  /** путь .bak, если исходник был сохранён сейчас */
  backupPath: string | null;
}

async function fsModule() {
  return await import("@tauri-apps/plugin-fs");
}

/**
 * Санитайз sibling answers.json: только question_id плейлиста + прогресс.
 * Бэкап исходника — один раз (`<answers>.bak`), файлы-улики не теряются.
 * Если файла ещё нет, создаёт документ с pending (агенту видно, что ждём).
 */
export async function sanitizeAnswersFileOnDisk(
  playlistPath: string,
  opts: { playlistId: string; questionIds: Iterable<string> },
): Promise<SanitizeAnswersResult> {
  const fs = await fsModule();
  const path = answersPathFor(playlistPath);
  let text: string | null = null;
  try {
    text = await fs.readTextFile(path);
  } catch {
    text = null;
  }
  const records: AnswerRecord[] = text ? parseAnswersFile(text) : [];
  const doc = buildAnswersDocument(records, {
    playlistId: opts.playlistId,
    questionIds: opts.questionIds,
  });
  let backupPath: string | null = null;
  if (text !== null) {
    const bak = `${path}.bak`;
    try {
      if (!(await fs.exists(bak))) {
        await fs.writeTextFile(bak, text);
        backupPath = bak;
      }
    } catch {
      // бэкап не удался — не блокируем санитайз, но и не врём о нём
    }
  }
  await fs.writeTextFile(path, serializeAnswersDocument(doc));
  return { doc, foreignRemoved: records.length - doc.answers.length, backupPath };
}

export async function writeAnswersDocumentFile(
  playlistPath: string,
  doc: AnswersDocument,
): Promise<string> {
  const fs = await fsModule();
  const path = answersPathFor(playlistPath);
  await fs.writeTextFile(path, serializeAnswersDocument(doc));
  return path;
}

/**
 * Копия answers.json в ack/ — «отправлено агенту». sent_by=auto пишется,
 * когда complete стал true; operator — по явной кнопке (можно и неполный).
 */
export async function writeAnswersAckFile(
  doc: AnswersDocument,
  commandId: string,
  sentBy: AnswersSentBy,
): Promise<string> {
  const fs = await fsModule();
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const ackDir = await join(await appDataDir(), "ack");
  await fs.mkdir(ackDir, { recursive: true });
  const target = await join(ackDir, `${commandId}.answers.json`);
  await fs.writeTextFile(target, JSON.stringify({ ...doc, sent_by: sentBy }, null, 2));
  return target;
}
