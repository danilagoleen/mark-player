// tb_1791233024_7043_1 — Resume: последнее видео + позиция при старте.
//
// Хранилище — localStorage рядом с vetka_player_lab_snapshot. Запись
// делает только открытие по пути (Tauri); браузерный File-путь
// переоткрыть нельзя, туда не пишем (App держит currentFilePath null).
// Чтение строгое: любой мусор = null (пустое окно), никогда не бросает.

export const LAST_OPEN_STORAGE_KEY = "vetka_player_lab_last_open_v1";

export interface LastOpen {
  path: string;
  positionSec: number;
}

export function readLastOpen(): LastOpen | null {
  try {
    const raw = localStorage.getItem(LAST_OPEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const path = record.path;
    const positionSec = record.positionSec;
    if (typeof path !== "string" || path.length === 0) return null;
    if (typeof positionSec !== "number" || !Number.isFinite(positionSec) || positionSec < 0) return null;
    return { path, positionSec };
  } catch {
    return null;
  }
}

export function writeLastOpen(path: string, positionSec: number): void {
  try {
    if (typeof path !== "string" || path.length === 0) return;
    if (typeof positionSec !== "number" || !Number.isFinite(positionSec) || positionSec < 0) return;
    localStorage.setItem(LAST_OPEN_STORAGE_KEY, JSON.stringify({ path, positionSec }));
  } catch {
    // хранилище недоступно (квота/приватный режим) — открытию не мешаем
  }
}

export function clearLastOpen(): void {
  try {
    localStorage.removeItem(LAST_OPEN_STORAGE_KEY);
  } catch {
    // ignore — нечему мешать
  }
}

// Решение холодного старта: явный ?src= всегда побеждает запись.
// Чистая функция — тестируется без монтирования App.
export function resolveResumeRequest(
  querySrc: string,
  stored: LastOpen | null | undefined,
): LastOpen | null {
  if (querySrc) return null;
  if (!stored) return null;
  return stored;
}
