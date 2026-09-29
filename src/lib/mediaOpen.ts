// 0.10.22 — same-file reopen guard.
//
// Kлик по текущей записи плейлиста зовёт handleOpenPath с тем же path.
// src при этом не меняется → <video> не стреляет loadedmetadata →
// сброс naturalSize в {0,0} схлопывал бы сцену до 1px (звук играет,
// картинки нет). Повторное открытие того же файла — no-op (+ resume).
import {
  computeContentHash,
  sampleBlob,
  sampleTauriFile,
} from "./contentHash";

export function isSameMediaPath(
  incomingPath: string,
  currentPath: string | null | undefined,
): boolean {
  if (!incomingPath || !currentPath) return false;
  return incomingPath === currentPath;
}

// 0.22 — identity открытия: content-hash содержимого (копия/переименование
// разметку не теряет) либо null, когда байты недоступны. Никогда не бросает:
// null — честный сигнал "привязывайся к пути, как раньше".
export async function resolveMediaContentHash(target: {
  path?: string;
  file?: File | Blob;
}): Promise<string | null> {
  try {
    if (target.file) {
      const sample = await sampleBlob(target.file);
      return computeContentHash(sample.size, sample.head, sample.tail);
    }
    if (target.path) {
      const sample = await sampleTauriFile(target.path);
      return computeContentHash(sample.size, sample.head, sample.tail);
    }
    return null;
  } catch {
    return null;
  }
}
