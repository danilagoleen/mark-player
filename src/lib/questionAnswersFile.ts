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
