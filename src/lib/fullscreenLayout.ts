// tb_1791146301_70644_14: геометрия фулскрина — поймать «пол-экрана чёрного».
//
// Плавающий баг: нативный фулскрин Tauri применяется асинхронно (macOS-анимация),
// а isFullscreen во фронте — асинхронный опрос win.isFullscreen(). Пока флаг false,
// на шелле висит shellSizeOverride в px → шелл не растёт → ResizeObserver молчит →
// video-raster остаётся на старом px-размере: маленькое видео сверху, чернота снизу.
// Если опрос приземлился до коммита нативного флага и новых resize-событий больше
// нет — раскладка застревает навсегда. Этот модуль — чистая часть фикса:
// захват трейса (п.1 заказа) + проверка sanity для e2e (п.3).

export interface BoxRect {
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface FullscreenGeometryTrace {
  /** ms epoch — когда снят. */
  at: number;
  /** Landed-флаг фронта на момент съёмки. */
  isFullscreen: boolean;
  windowInnerWidth: number;
  windowInnerHeight: number;
  devicePixelRatio: number;
  shellWidth: number;
  shellHeight: number;
  viewerWidth: number;
  viewerHeight: number;
  videoWidth: number;
  videoHeight: number;
  videoTop: number;
  videoLeft: number;
}

export const FULLSCREEN_TRANSITION_TIMEOUT_MS = 1500;

/** Доля высоты окна, которую кадр обязан занимать в фулскрине (сигнатура бага — ~половина). */
export const FULLSCREEN_MIN_VIDEO_HEIGHT_RATIO = 0.5;

export function emptyRect(): BoxRect {
  return { width: 0, height: 0, top: 0, left: 0 };
}

export function rectOf(
  el: { getBoundingClientRect(): { width: number; height: number; top: number; left: number } } | null | undefined,
): BoxRect {
  if (!el) return emptyRect();
  try {
    const r = el.getBoundingClientRect();
    return {
      width: Number(r.width || 0),
      height: Number(r.height || 0),
      top: Number(r.top || 0),
      left: Number(r.left || 0),
    };
  } catch {
    return emptyRect();
  }
}

export function captureFullscreenTrace(args: {
  isFullscreen: boolean;
  windowInnerWidth: number;
  windowInnerHeight: number;
  devicePixelRatio: number;
  shellRect: BoxRect;
  viewerRect: BoxRect;
  videoRect: BoxRect;
  at?: number;
}): FullscreenGeometryTrace {
  return {
    at: args.at ?? Date.now(),
    isFullscreen: args.isFullscreen,
    windowInnerWidth: Math.max(0, Number(args.windowInnerWidth || 0)),
    windowInnerHeight: Math.max(0, Number(args.windowInnerHeight || 0)),
    devicePixelRatio: Number(args.devicePixelRatio || 1),
    shellWidth: args.shellRect.width,
    shellHeight: args.shellRect.height,
    viewerWidth: args.viewerRect.width,
    viewerHeight: args.viewerRect.height,
    videoWidth: args.videoRect.width,
    videoHeight: args.videoRect.height,
    videoTop: args.videoRect.top,
    videoLeft: args.videoRect.left,
  };
}

/**
 * Санити фулскрин-раскладки. Вне фулскрина судить не о чем → true.
 * В фулскрине видео обязано покрывать не меньше половины высоты окна —
 * ровно та сигнатура, что ловил оператор (видео сверху, чернота снизу).
 */
export function isFullscreenLayoutSane(trace: FullscreenGeometryTrace): boolean {
  if (!trace.isFullscreen) return true;
  if (trace.windowInnerHeight <= 0) return true;
  if (trace.videoWidth <= 0 || trace.videoHeight <= 0) return false;
  return trace.videoHeight >= trace.windowInnerHeight * FULLSCREEN_MIN_VIDEO_HEIGHT_RATIO;
}
