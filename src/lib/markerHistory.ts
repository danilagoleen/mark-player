// 0.20: undo/redo истории маркеров (фидбэк оператора: ⌘Z + Clear all).
// Чистый неизменяемый стек снимков: прошлое (past) + отменённое (future).
// Окна держат по своему экземпляру (main — маркеры, comments — комменты),
// синхронизация между окнами — через storage-события, как раньше.
// Снапшоты хранятся по ссылке: вызывающий отдаёт массивы, которые сам
// больше не мутирует (React state по конвенции неизменяем).
import { markerBelongsToMedia } from "./markersSync";
import { QUESTION_MARKER_ID_PREFIX, isQuestionMarker } from "./markerReply";

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
  content_hash?: string | null;
  /** id и поле вопроса — чтобы Clear не сносил импорт Беты (см. ниже). */
  marker_id?: string;
  question_id?: string | null;
  /** reply_to родителя — ответы на вопросы Clear не трогает (см. ниже). */
  reply_to?: string | null;
}

const CLEAR_SCOPE_KINDS: Record<Exclude<ClearScope, "all">, string[]> = {
  comment: ["comment"],
  favorite: ["favorite"],
  negative: ["negative"],
  inout: ["in", "out"],
};

// Жертвы очистки: маркеры этого media, отфильтрованные по scope.
// media null → [] (без видео чистить нечего).
// 0.22: опциональный contentHash — та же identity, что у списка
// (markerBelongsToMedia): копия видео чистит СВОИ метки, а не путь.
// tb_1791845483_63972_1: маркеры вопросов (импорт Беты) НЕ жертвы никогда —
// иначе Clear убивает qmat и карточке не к чему цеплять ответы (кейс 0.25.57:
// Confirm молча ничего не создал). Вопросы чистятся только удалением плейлиста.
// tb_1791845483_63972_1: ответы-реплики на вопросы — тоже НЕ жертвы: с 0.25.55
// ответы единственная правда, undo живёт только до перезапуска — Clear по видам
// стирал ответы человека. Ответы удаляются только поштучно (один клик в окне
// Markers, штатный deleteMarkerById мимо selectMarkersToClear).
function isQuestionReply<T extends HasKindMedia>(m: T, byId: Map<string, T>): boolean {
  const parentRef = typeof m.reply_to === "string" ? m.reply_to.trim() : "";
  if (!parentRef) return false;
  const parent = byId.get(parentRef);
  // Родитель в массиве: вопрос — поле question_id, иначе легаси-префикс id.
  if (parent) return isQuestionMarker(parent.marker_id, parent.question_id);
  // Родителя нет в массиве — верим префиксу qmat_ (легаси-импорты Беты).
  return parentRef.startsWith(QUESTION_MARKER_ID_PREFIX);
}

function indexMarkersById<T extends HasKindMedia>(markers: T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const m of markers) {
    if (typeof m.marker_id === "string" && m.marker_id) byId.set(m.marker_id, m);
  }
  return byId;
}

export function selectMarkersToClear<T extends HasKindMedia>(
  markers: T[],
  media: string | null,
  scope: ClearScope,
  contentHash: string | null = null,
): T[] {
  if (!media) return [];
  const kinds = scope === "all" ? null : CLEAR_SCOPE_KINDS[scope];
  const byId = indexMarkersById(markers);
  return markers.filter(
    (m) =>
      markerBelongsToMedia(m, { mediaKey: media, contentHash }) &&
      (kinds === null || kinds.includes(m.kind)) &&
      !isQuestionMarker(m.marker_id, m.question_id) &&
      !isQuestionReply(m, byId),
  );
}

// Сколько ответов на вопросы пощадила эта очистка — для честного confirm.
// Тот же media/scope/kinds, что у жертв: чужой вид не считаем.
export function countSparedQuestionReplies<T extends HasKindMedia>(
  markers: T[],
  media: string | null,
  scope: ClearScope,
  contentHash: string | null = null,
): number {
  if (!media) return 0;
  const kinds = scope === "all" ? null : CLEAR_SCOPE_KINDS[scope];
  const byId = indexMarkersById(markers);
  let spared = 0;
  for (const m of markers) {
    if (!markerBelongsToMedia(m, { mediaKey: media, contentHash })) continue;
    if (kinds !== null && !kinds.includes(m.kind)) continue;
    if (isQuestionMarker(m.marker_id, m.question_id)) continue;
    if (isQuestionReply(m, byId)) spared += 1;
  }
  return spared;
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
// keptReplies — пощажённые ответы на вопросы (tb_1791845483_63972_1).
export function formatClearConfirm<T extends HasKindMedia>(victims: T[], keptReplies = 0): string {
  const byBucket = new Map<string, number>();
  for (const m of victims) {
    const bucket = clearKindBucket(m.kind);
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + 1);
  }
  const parts = [...byBucket.entries()].map(([bucket, count]) => kindCountLabel(bucket, count));
  const total = victims.length;
  const totalLabel = total === 1 ? "marker" : "markers";
  const kept =
    keptReplies > 0
      ? ` Question markers and ${keptReplies === 1 ? "1 question reply" : `${keptReplies} question replies`} are kept.`
      : " Question markers are kept.";
  return `Delete ${parts.join(" and ")} (${total} ${totalLabel} of this video)?${kept} You can bring the rest back with Undo (Cmd+Z).`;
}

// Нативный confirm очистки. Tauri — plugin-dialog, браузер (dev) —
// window.confirm. Отмена/недоступность → false.
export async function confirmClearMarkers<T extends HasKindMedia>(victims: T[], keptReplies = 0): Promise<boolean> {
  if (!victims.length) return false;
  const message = formatClearConfirm(victims, keptReplies);
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
