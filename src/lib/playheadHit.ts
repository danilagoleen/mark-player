// tb_1791844731_63972_4: плейхед-вертикаль — одна чистая hitTest таймлайна.
// Спека docs/217_ph_cut-player/SPEC_PLAYHEAD_VERTICAL_2026-10-13.md §3.2:
// весь блок таймлайна — один слой указателя, решение «кого хватаем» — здесь,
// без DOM и Tauri. Звонящий (App) переводит событие в PlayheadHitInput:
// ряд по цели события (линейка vs всё ниже), x/playheadX в px от левого края
// шкалы, значки — id + центр + полуширина (совпадают с отрисованными).
// Чистый модуль: только арифметика, тестируется юнитами построчно.

/** Ряд нажатия: линейка времени — или всё ниже (маркеры, скобки, полоса). */
export type PlayheadHitRow = "ruler" | "lane";

/** Значок на шкале: маркер любого вида или скобка in/out. */
export interface PlayheadHitMarker {
  id: string;
  /** Центр значка, px от левого края шкалы. */
  x: number;
  /** Половина ширины зоны хвата значка, px. */
  halfWidth: number;
}

export interface PlayheadHitInput {
  row: PlayheadHitRow;
  /** Точка нажатия, px от левого края шкалы. */
  x: number;
  /** Позиция плейхеда, px от левого края шкалы. */
  playheadX: number;
  markers: PlayheadHitMarker[];
  altKey: boolean;
}

export type PlayheadHit =
  | { target: "playhead" }
  | { target: "marker"; markerId: string }
  | { target: "scrub" };

/** §3.2 п.2: гало плейхеда — шарики и ±px от линии на любой высоте. */
export const PLAYHEAD_HALO_PX = 5;

/** §3.3: значок едет только после сдвига по горизонтали. */
export const MARKER_DRAG_THRESHOLD_PX = 4;

function nearestMarkerAt(markers: PlayheadHitMarker[], x: number): PlayheadHitMarker | null {
  let best: PlayheadHitMarker | null = null;
  let bestDx = Infinity;
  for (const m of markers) {
    const dx = Math.abs(x - m.x);
    if (dx <= m.halfWidth && dx < bestDx) {
      best = m;
      bestDx = dx;
    }
  }
  return best;
}

/**
 * Порядок правил — по таблице §3.2, с одной оговоркой: п.3 (Alt+значок)
 * бьёт п.2 (гало) — «даже если он под плейхедом (запасной путь)».
 */
export function hitTestPlayhead(input: PlayheadHitInput): PlayheadHit {
  // §3.2 п.1: линейка — всегда плейхед, прыжок в точку + протяжка.
  if (input.row === "ruler") return { target: "playhead" };
  const hit = nearestMarkerAt(input.markers, input.x);
  // §3.2 п.3: Alt+значок — маркер даже под плейхедом.
  if (hit && input.altKey) return { target: "marker", markerId: hit.id };
  // §3.2 п.2: шарики и ±5px от линии — плейхед.
  if (Math.abs(input.x - input.playheadX) <= PLAYHEAD_HALO_PX) return { target: "playhead" };
  // §3.2 п.4: значок вне зоны плейхеда — маркер (порог — жестом, в App).
  if (hit) return { target: "marker", markerId: hit.id };
  // §3.2 п.5: пустое место рядов — scrub (прыжок + протяжка, как линейка).
  return { target: "scrub" };
}

/**
 * §3.3, жестовая половина: нажатие на значок — ещё не перетаскивание.
 * true = порог пройден, значок едет; false = клик (плейхед на anchor_sec).
 */
export function markerDragThresholdPassed(
  startX: number,
  curX: number,
  threshold: number = MARKER_DRAG_THRESHOLD_PX,
): boolean {
  return Math.abs(curX - startX) >= threshold;
}
