// 0.20: undo/redo истории маркеров (фидбэк оператора: ⌘Z + Clear all).
// Чистый неизменяемый стек снимков: прошлое (past) + отменённое (future).
// Окна держат по своему экземпляру (main — маркеры, comments — комменты),
// синхронизация между окнами — через storage-события, как раньше.
// Снапшоты хранятся по ссылке: вызывающий отдаёт массивы, которые сам
// больше не мутирует (React state по конвенции неизменяем).

export interface MarkerHistory<T> {
  past: T[][];
  future: T[][];
  cap: number;
}

export const MARKER_HISTORY_CAP = 50;

export function createMarkerHistory<T>(cap: number = MARKER_HISTORY_CAP): MarkerHistory<T> {
  const safeCap = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : MARKER_HISTORY_CAP;
  return { past: [], future: [], cap: safeCap };
}

export function historyCanUndo<T>(history: MarkerHistory<T>): boolean {
  return history.past.length > 0;
}

export function historyCanRedo<T>(history: MarkerHistory<T>): boolean {
  return history.future.length > 0;
}

// Push снимка "до" мутации. Любой новый push инвалидирует redo (future).
export function historyPush<T>(history: MarkerHistory<T>, snapshot: T[]): MarkerHistory<T> {
  const past = [...history.past, snapshot];
  const trimmed = past.length > history.cap ? past.slice(past.length - history.cap) : past;
  return { past: trimmed, future: [], cap: history.cap };
}

// Undo: current уходит в future, верх past становится текущим.
// Пустой стек — null (вызывающий показывает "Nothing to undo.").
export function historyUndo<T>(
  history: MarkerHistory<T>,
  current: T[],
): { history: MarkerHistory<T>; snapshot: T[] } | null {
  if (history.past.length === 0) return null;
  const snapshot = history.past[history.past.length - 1];
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, current], cap: history.cap },
    snapshot,
  };
}

// Redo: симметрично undo.
export function historyRedo<T>(
  history: MarkerHistory<T>,
  current: T[],
): { history: MarkerHistory<T>; snapshot: T[] } | null {
  if (history.future.length === 0) return null;
  const snapshot = history.future[history.future.length - 1];
  return {
    history: { past: [...history.past, current], future: history.future.slice(0, -1), cap: history.cap },
    snapshot,
  };
}
