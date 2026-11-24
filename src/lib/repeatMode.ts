// tb_1795483282_27036_4 (слово оператора 24.11): повтор one/all — ОДИН луп.
//
// Нажатие в одном месте равно нажатию в другом: меню Loop/Repeat главного окна и кнопка
// Repeat окна Playlist — два входа в одну функцию (cycleRepeatMode), состояние одно
// (PlaybackMode.loop в localStorage, его же читает advanceToNextEntry), video.loop
// выводится из него (nativeLoopFor). Окно Playlist — ОТДЕЛЬНОЕ окно Tauri, 'storage' между
// вебвью не приходит (tb_1791563210_29299_4), поэтому смена едет событием repeat-mode:changed
// — как inout-play:changed у ножниц.
//
// Смысл режимов (решения оператора):
//   ONE: ножницы вкл — одна черта вопроса, иначе один In–Out под плейхедом (в щели —
//        следующий отрезок), иначе весь файл; ножницы выкл — один файл.
//   ALL: ножницы выкл — весь плейлист по кругу; ножницы вкл — все отрезки (черты и скобки
//        по всем записям) по кругу.

import { loadPlaybackMode, nextLoopMode, savePlaybackMode, type LoopMode, type PlaybackMode } from "./playlist";
import type { PlaybackSegment } from "./inOutPlayback";

export const REPEAT_CHANGED_EVENT = "repeat-mode:changed";

function inTauri(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

/** {loop: off|all|one} → loop; всё остальное — null (мусор не меняет режим). */
export function parseRepeatEvent(payload: unknown): LoopMode | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const loop = (payload as { loop?: unknown }).loop;
  return loop === "off" || loop === "all" || loop === "one" ? loop : null;
}

/** Сказать другим окнам «повтор теперь loop». Возвращает транспорт. */
export async function notifyRepeatChanged(loop: LoopMode): Promise<"tauri" | "storage"> {
  if (!inTauri()) return "storage";
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(REPEAT_CHANGED_EVENT, { loop });
  } catch (error) {
    console.warn("[Mark Player] repeat-mode:changed emit failed:", error);
  }
  return "tauri";
}

/** Слушать смену повтора из другого окна (и свою: Tauri-emit доходит до всех окон). Вне Tauri — пустая отписка. */
export async function listenRepeatChanged(cb: (loop: LoopMode) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen(REPEAT_CHANGED_EVENT, (event: { payload: unknown }) => {
      const loop = parseRepeatEvent(event.payload);
      if (loop !== null) cb(loop);
    });
    return unlisten;
  } catch (error) {
    console.warn("[Mark Player] repeat-mode:changed listen failed:", error);
    return () => {};
  }
}

/** Записать повтор в общее хранилище режима (shuffle не трогаем) и сообщить другим окнам. */
export function setRepeatMode(loop: LoopMode): PlaybackMode {
  const next: PlaybackMode = { ...loadPlaybackMode(), loop };
  savePlaybackMode(next);
  void notifyRepeatChanged(loop);
  return next;
}

/**
 * ЕДИНСТВЕННЫЙ вход переключения повтора: off → all → one → off, от общего состояния
 * (не от копии окна). Зовут и меню главного окна, и кнопка окна Playlist.
 */
export function cycleRepeatMode(): LoopMode {
  const next = nextLoopMode(loadPlaybackMode().loop);
  setRepeatMode(next);
  return next;
}

/** Текст тоста: Repeat: one | all | off. */
export function repeatToastText(loop: LoopMode): string {
  return `Repeat: ${loop}`;
}

/**
 * video.loop из общего режима. Нативный луп нужен, только когда крутить файл целиком:
 *   ножницы выкл + one — один файл по кругу;
 *   ножницы выкл + all — плейлист по кругу (нативный луп мешал бы 'ended' и автопереходу),
 *     а если запись одна или плейлиста нет, файл и есть плейлист — нативный луп.
 * Ножницы вкл — луп делает сам плеер на OUT (черты/скобки), нативный выключен.
 */
export function nativeLoopFor(args: { mode: LoopMode; scissorsOn: boolean; entryCount: number }): boolean {
  if (args.mode === "off" || args.scissorsOn) return false;
  if (args.mode === "one") return true;
  return args.entryCount <= 1;
}

export interface RepeatWindow {
  start: number;
  end: number;
  source: "segment" | "file";
}

/**
 * Что крутит ONE. Ножницы выкл или отрезков нет — весь файл. Иначе отрезок под плейхедом
 * (IN входит, OUT нет); плейхед в щели — следующий отрезок (выбор Alpha, слово оператора
 * «в щели следующий»); следующего нет — последний (отрезки есть, а весь файл крутить
 * не хотели). Единственный отрезок (одна черта вопроса) — он, где бы ни стоял плейхед.
 * Чистая, тестируем.
 */
export function repeatOneWindow(args: {
  scissorsOn: boolean;
  segments: PlaybackSegment[];
  playhead: number;
  duration: number;
}): RepeatWindow {
  const duration = Number.isFinite(args.duration) && args.duration > 0 ? args.duration : 0;
  const whole: RepeatWindow = { start: 0, end: duration, source: "file" };
  if (!args.scissorsOn) return whole;
  const segs = (Array.isArray(args.segments) ? args.segments : [])
    .filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  if (segs.length === 0) return whole;
  const t = Number.isFinite(args.playhead) ? args.playhead : Number.NEGATIVE_INFINITY;
  const pick = segs.find((s) => s.start <= t && t < s.end) ?? segs.find((s) => s.start > t) ?? segs[segs.length - 1];
  return { start: pick.start, end: pick.end, source: "segment" };
}
