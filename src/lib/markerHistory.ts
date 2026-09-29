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

// 0.21: Clear по видам (фидбэк оператора: Clear all чистил только текст).
// Scope — ТОЛЬКО текущее видео (media), никогда общая куча.

export type ClearScope = "comment" | "favorite" | "negative" | "inout" | "all";

export interface HasKindMedia {
  kind: string;
  media_path?: string;
}

const CLEAR_SCOPE_KINDS: Record<Exclude<ClearScope, "all">, string[]> = {
  comment: ["comment"],
  favorite: ["favorite"],
  negative: ["negative"],
  inout: ["in", "out"],
};

// Жертвы очистки: маркеры этого media, отфильтрованные по scope.
// media null → [] (без видео чистить нечего).
export function selectMarkersToClear<T extends HasKindMedia>(
  markers: T[],
  media: string | null,
  scope: ClearScope,
): T[] {
  if (!media) return [];
  const kinds = scope === "all" ? null : CLEAR_SCOPE_KINDS[scope];
  return markers.filter((m) => m.media_path === media && (kinds === null || kinds.includes(m.kind)));
}

// Ведро вида для confirm-разбивки: in/out идут одной строкой.
export function clearKindBucket(kind: string): string {
  if (kind === "in" || kind === "out") return "inout";
  return kind;
}

const KIND_LABELS: Record<string, [string, string]> = {
  comment: ["comment", "comments"],
  favorite: ["favorite", "favorites"],
  negative: ["negative", "negatives"],
  inout: ["in/out point", "in/out points"],
  chat: ["chat marker", "chat markers"],
};

function kindCountLabel(bucket: string, count: number): string {
  const [one, many] = KIND_LABELS[bucket] ?? [`${bucket} marker`, `${bucket} markers`];
  return `${count} ${count === 1 ? one : many}`;
}

// EN-текст нативного confirm: разбивка по видам + честное "вернётся через Undo".
export function formatClearConfirm<T extends HasKindMedia>(victims: T[]): string {
  const byBucket = new Map<string, number>();
  for (const m of victims) {
    const bucket = clearKindBucket(m.kind);
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + 1);
  }
  const parts = [...byBucket.entries()].map(([bucket, count]) => kindCountLabel(bucket, count));
  const total = victims.length;
  const totalLabel = total === 1 ? "marker" : "markers";
  return `Delete ${parts.join(" and ")} (${total} ${totalLabel} of this video)? You can bring them back with Undo (Cmd+Z).`;
}

// Нативный confirm очистки. Tauri — plugin-dialog, браузер (dev) —
// window.confirm. Отмена/недоступность → false.
export async function confirmClearMarkers<T extends HasKindMedia>(victims: T[]): Promise<boolean> {
  if (!victims.length) return false;
  const message = formatClearConfirm(victims);
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const dialog = await import("@tauri-apps/plugin-dialog");
      return await dialog.confirm(message, { title: "Clear markers", kind: "warning", okLabel: "Delete" });
    }
  } catch {
    // fall through to window.confirm
  }
  try {
    if (typeof window !== "undefined" && typeof window.confirm === "function") return window.confirm(message);
  } catch {
    // ignore
  }
  return false;
}
