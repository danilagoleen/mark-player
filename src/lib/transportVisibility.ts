// tb_1791675182_1275_1 — корень залипа тулбара: таймер автохайда гасил
// панель при stall (currentTime стоит, isMoving висит — новое видео на
// probe/attach, fetch→blob тяжёлых прокси, 4K-буферизация), а обратно её
// не показывал никто. Прятать можно только реально идущее
// воспроизведение: время в момент срабатывания должно уйти вперёд от
// времени взвода. Иначе (stall/пауза/конец) — не трогаем, тики сами
// перевзведут эффект.

/** Позиция плейхеда в момент взвода таймера. */
export interface HideArming {
  /** currentTime на момент взвода. NaN — взвод невозможен, не прятать. */
  armedTime: number;
  /** currentTime в момент срабатывания. */
  firedTime: number;
  /** video.paused в момент срабатывания. */
  paused: boolean;
  /** video.ended в момент срабатывания. */
  ended: boolean;
}

export function shouldHideTransport(arming: HideArming): boolean {
  if (arming.paused || arming.ended) return false;
  if (!Number.isFinite(arming.armedTime) || !Number.isFinite(arming.firedTime)) return false;
  return arming.firedTime > arming.armedTime;
}

// tb_1791680717_1275_3 — диагностика без консоли: кольцо переходов тулбара.
// В прод-Tauri нет F12, поэтому история пишется в память (только basename
// файла — приватность) и показывается в Geometry Inspector (Alt+I).
// Открытие инспектора триггерит ререндер, но история хранит состояние ДО.

/** Одна запись перехода видимости тулбара. */
export interface TransportTraceEntry {
  /** performance.now() в момент записи. */
  ts: number;
  /** showTransport после перехода. */
  show: boolean;
  /** chromeHidden (фулскрин-хром) после перехода. */
  chrome: boolean;
  /** isMoving (shuttle/playing) после перехода. */
  moving: boolean;
  /** mediaKind после перехода. */
  kind: string | null;
  /** basename файла (пути наружу не едут). */
  file: string;
  /** tb_1791681499_1275_4: режим выбора next (S/s + loop) — видно шаффл. */
  mode?: string;
}

/** Дописать запись в кольцо, держать не больше cap (по умолчанию 30). */
export function pushTransportTrace(
  ring: TransportTraceEntry[],
  entry: TransportTraceEntry,
  cap = 30,
): TransportTraceEntry[] {
  const next = [...ring, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
