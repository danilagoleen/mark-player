// tb_1791854416_63972_5: импорт везёт видео с собой.
// Чистые решения меню-импорта (без DOM/Tauri):
// - SOS Markers JSON пишет media_path + content_hash, но импорт их игнорировал —
//   маркеры ложились на текущее видео, а без видео — в пустоту (тост врал);
// - File > Open Playlist вообще не открывал видео: qmat-маркеры
//   материализовались мимо currentMediaKey — Markers пуст, гард гасил Confirm
//   (через окно плейлиста работало, т.к. оператор открывал видео сам).
// Правило: файл с привязкой к видео сначала открывает его (один distinct path —
// открываем; несколько — не гадаем), затем кладут маркеры. Чистый модуль.
import { isSameMediaPath } from "./mediaOpen";

/** Привязка файла к видео: верх SOS или единственный path записей. */
export interface MarkersFileBinding {
  mediaPath: string | null;
  contentHash: string | null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Верх SOS-экспорта (exportToSidecar): media_path + content_hash. */
export function readSidecarBinding(parsed: unknown): MarkersFileBinding {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { mediaPath: null, contentHash: null };
  }
  const doc = parsed as Record<string, unknown>;
  return {
    mediaPath: nonEmptyString(doc.media_path),
    contentHash: nonEmptyString(doc.content_hash),
  };
}

/**
 * Единственный distinct path записей плейлиста — его и открываем.
 * Несколько разных — null (не гадаем, оператор выберет записью).
 */
export function singlePlaylistMediaPath(entries: unknown): string | null {
  if (!Array.isArray(entries)) return null;
  let found: string | null = null;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const p = nonEmptyString((e as { path?: unknown }).path);
    if (!p) continue;
    if (found === null) found = p;
    else if (found !== p) return null;
  }
  return found;
}

export type MarkersImportTarget =
  | { mode: "open"; path: string }
  | { mode: "attach" }
  | { mode: "need-video" };

/**
 * Куда девать маркеры файла (currentFilePath — сырой путь, не asset-URL:
 * привязка SOS — тоже сырой путь, сравниваем их; currentMediaKey здесь
 * не годится — там convertFileSrc):
 * - привязка есть и файлы открывать умеем (Tauri) — открыть её видео,
 *   если оно не текущее; уже текущее — просто цеплять;
 * - привязки нет (голый массив) или открывать не умеем (веб) — цеплять
 *   на текущее, без него — честный need-video.
 */
export function decideMarkersImportTarget(
  binding: MarkersFileBinding,
  currentFilePath: string | null,
  canOpenFiles: boolean,
): MarkersImportTarget {
  if (binding.mediaPath && canOpenFiles) {
    if (!currentFilePath || !isSameMediaPath(binding.mediaPath, currentFilePath)) {
      return { mode: "open", path: binding.mediaPath };
    }
    return { mode: "attach" };
  }
  return currentFilePath ? { mode: "attach" } : { mode: "need-video" };
}
