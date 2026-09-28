// 0.10.22 — same-file reopen guard.
//
// Kлик по текущей записи плейлиста зовёт handleOpenPath с тем же path.
// src при этом не меняется → <video> не стреляет loadedmetadata →
// сброс naturalSize в {0,0} схлопывал бы сцену до 1px (звук играет,
// картинки нет). Повторное открытие того же файла — no-op (+ resume).
export function isSameMediaPath(
  incomingPath: string,
  currentPath: string | null | undefined,
): boolean {
  if (!incomingPath || !currentPath) return false;
  return incomingPath === currentPath;
}
